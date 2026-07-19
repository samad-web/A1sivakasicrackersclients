// reminders-start: admin-triggered. Computes who is unpaid for the target month and
// enqueues one reminder_messages row per recipient under a reminder_runs row. Returns
// fast; the cron-driven reminders-worker actually sends. Never sends here.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

/** orders.number is a bare 10-digit string; KWIC wants 91-prefixed. Null => unusable. */
function toKwicNumber(raw: unknown): string | null {
    const d = String(raw ?? "").replace(/\D/g, "")
    if (d.length === 10) return `91${d}`
    if (d.length === 12 && d.startsWith("91")) return d
    if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`
    return null // e.g. a +1 US number — skip rather than misroute
}

/** Active cycle year (cycle starts in November). Mirrors src/utils/cycle.ts. */
function currentCycleYear(now: Date): number {
    return now.getMonth() >= 10 ? now.getFullYear() : now.getFullYear() - 1
}

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

    try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
        const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!

        // --- AuthZ: caller must be a signed-in admin -------------------------
        const authHeader = req.headers.get("Authorization") ?? ""
        const userClient = createClient(SUPABASE_URL, ANON_KEY, {
            global: { headers: { Authorization: authHeader } },
        })
        const { data: { user } } = await userClient.auth.getUser()
        if (!user?.email) return json({ error: "Not authenticated" }, 401)

        const admin = createClient(SUPABASE_URL, SERVICE_KEY)
        const { data: adminRow } = await admin
            .from("admins").select("email").eq("email", user.email).maybeSingle()
        if (!adminRow) return json({ error: "Not authorized" }, 403)

        // --- Inputs ----------------------------------------------------------
        const body = req.method === "POST" ? await req.json().catch(() => ({})) : {}
        const now = new Date()
        const monthName: string = body.month_name ||
            now.toLocaleDateString("en-US", { month: "long" })
        const cycleYear: number = Number.isInteger(body.cycle_year)
            ? body.cycle_year : currentCycleYear(now)

        // --- Test mode: enqueue a single message to a given number -----------
        if (body.test_phone) {
            const phone = toKwicNumber(body.test_phone)
            if (!phone) return json({ error: "Invalid test phone number" }, 400)
            const { data: run, error: runErr } = await admin.from("reminder_runs")
                .insert({
                    month_name: monthName, cycle_year: cycleYear, is_test: true,
                    status: "running", total_count: 1, triggered_by: user.email,
                }).select("id").single()
            if (runErr) throw runErr
            const { error: msgErr } = await admin.from("reminder_messages").insert({
                run_id: run.id, name: String(body.test_name || "Test"), phone,
                amount: String(body.test_amount || "100"), status: "pending",
            })
            if (msgErr) throw msgErr
            return json({ run_id: run.id, test: true, pending: 1, skipped: 0, total: 1 })
        }

        // --- Compute unpaid recipients (service role) ------------------------
        // orders ⋈ monthly_payments on the target month, payment_status <> 'Completed',
        // scoped to the active cycle by created_at. Matches src/hooks/useOrders.ts.
        const startDate = new Date(cycleYear, 10, 1).toISOString()      // Nov 1
        const endDate = new Date(cycleYear + 1, 9, 1).toISOString()     // Oct 1 (excl.)
        const { data: orders, error: qErr } = await admin
            .from("orders")
            .select("id,receipt_no,name,number,scheme,monthly_payments!inner(payment_status,month_name)")
            .eq("monthly_payments.month_name", monthName)
            .neq("monthly_payments.payment_status", "Completed")
            .gte("created_at", startDate)
            .lt("created_at", endDate)
            .limit(5000)
        if (qErr) throw qErr

        type Row = { status: string; skip_reason?: string; order_id: string; receipt_no: string; name: string | null; phone: string | null; amount: string }
        const rows: Row[] = []
        for (const o of orders ?? []) {
            const name = (o.name ?? "").trim()
            const phone = toKwicNumber(o.number)
            const amount = Number(o.scheme)
            let skip: string | null = null
            if (!name) skip = "missing name"
            else if (!phone) skip = "invalid phone"
            else if (!Number.isFinite(amount) || amount <= 0) skip = "invalid amount"
            rows.push({
                order_id: o.id, receipt_no: o.receipt_no, name, phone,
                amount: String(o.scheme ?? ""),
                status: skip ? "skipped" : "pending",
                skip_reason: skip ?? undefined,
            })
        }
        const pending = rows.filter((r) => r.status === "pending").length
        const skipped = rows.length - pending

        // --- Create the run (run-lock enforced by partial unique index) ------
        const { data: run, error: runErr } = await admin.from("reminder_runs")
            .insert({
                month_name: monthName, cycle_year: cycleYear, is_test: false,
                status: pending > 0 ? "running" : "completed",
                total_count: rows.length, skipped_count: skipped,
                triggered_by: user.email,
                completed_at: pending > 0 ? null : new Date().toISOString(),
            }).select("id").single()
        if (runErr) {
            if ((runErr as { code?: string }).code === "23505") {
                return json({ error: `A reminder run for ${monthName} is already in progress.` }, 409)
            }
            throw runErr
        }

        if (rows.length > 0) {
            const payload = rows.map((r) => ({ run_id: run.id, ...r }))
            const { error: insErr } = await admin.from("reminder_messages").insert(payload)
            if (insErr) throw insErr
        }

        return json({ run_id: run.id, total: rows.length, pending, skipped, month_name: monthName })
    } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, 500)
    }
})
