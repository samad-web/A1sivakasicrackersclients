// reminders-worker: cron-driven queue drainer. Each tick claims a small batch of pending
// reminder_messages for the oldest active run and sends them via KWIC at a paced rate,
// then marks each sent/failed and completes the run when the queue is empty.
//
// Throughput is one knob: MSGS_PER_MIN. Spacing = 60000/MSGS_PER_MIN; the batch is sized
// to finish within a safe per-invocation budget, so raising MSGS_PER_MIN drains faster.
//
// Per-message outcome is THREE-way, learned the hard way this session:
//   200 + message_id  -> sent
//   200 + message_id:null -> failed, NO retry (accepted-but-not-dispatched; retrying spams)
//   429 / 5xx / network -> transient: back to pending, attempts++, retry next tick until MAX
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const MAX_RUNTIME_MS = 45_000 // keep each invocation well under the edge-function ceiling

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
}

/** Send one reminder via KWIC. Returns a classified outcome. */
async function sendOne(
    base: string, apiKey: string, templateId: string,
    monthName: string, m: { phone: string; name: string; amount: string },
): Promise<{ kind: "sent" | "failed" | "transient"; messageId?: string; response?: unknown; error?: string }> {
    const url = new URL("api/v1/push", base)
    url.searchParams.set("api_key", apiKey)
    let res: Response
    try {
        res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                mobile_number: m.phone,
                // Named template variables — literal placeholder keys; values change, keys don't.
                variable: { "July": monthName, "DavidYash": m.name, "500": m.amount },
                template_id: templateId,
            }),
        })
    } catch (e) {
        return { kind: "transient", error: `network: ${e instanceof Error ? e.message : String(e)}` }
    }
    const text = await res.text()
    if (res.status === 429 || res.status >= 500) {
        return { kind: "transient", error: `kwic ${res.status}: ${text.slice(0, 200)}` }
    }
    if (!res.ok) {
        return { kind: "failed", error: `kwic ${res.status}: ${text.slice(0, 200)}` }
    }
    let parsed: Record<string, unknown>
    try { parsed = JSON.parse(text) } catch { return { kind: "failed", error: `non-JSON: ${text.slice(0, 200)}`, response: { raw: text } } }
    if (!parsed.message_id) {
        return { kind: "failed", error: "not dispatched (message_id null)", response: parsed }
    }
    return { kind: "sent", messageId: String(parsed.message_id), response: parsed }
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

    // Guard: this function is publicly invokable; only the cron (which knows the secret)
    // may drive the queue.
    const cronSecret = Deno.env.get("CRON_SECRET")
    if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
        return json({ error: "Forbidden" }, 401)
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const KWIC_BASE_URL = Deno.env.get("KWIC_BASE_URL")!
    const KWIC_API_KEY = Deno.env.get("KWIC_API_KEY")!
    const KWIC_TEMPLATE_ID = Deno.env.get("KWIC_TEMPLATE_ID")!
    const MSGS_PER_MIN = Math.max(1, Number(Deno.env.get("MSGS_PER_MIN") ?? "12"))
    const MAX_ATTEMPTS = Math.max(1, Number(Deno.env.get("MAX_ATTEMPTS") ?? "3"))

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    try {
        // Recover rows from a worker that died mid-batch.
        await admin.rpc("reclaim_stuck_messages", { p_older_than: "5 minutes" })

        // Oldest active run (test or real).
        const { data: run } = await admin.from("reminder_runs")
            .select("id,month_name").eq("status", "running")
            .order("created_at", { ascending: true }).limit(1).maybeSingle()
        if (!run) return json({ idle: true })

        // Pace + batch size. Batch is capped so the whole tick finishes inside the budget.
        const spacing = Math.round(60_000 / MSGS_PER_MIN)
        const batchSize = Math.max(1, Math.min(MSGS_PER_MIN, Math.floor(MAX_RUNTIME_MS / spacing) + 1))

        const { data: claimed, error: claimErr } = await admin
            .rpc("claim_reminder_batch", { p_run_id: run.id, p_limit: batchSize })
        if (claimErr) throw claimErr

        let sent = 0, failed = 0, backoff = false
        const messages = (claimed ?? []) as Array<{ id: string; phone: string; name: string; amount: string; attempts: number }>
        const start = Date.now()

        for (let i = 0; i < messages.length; i++) {
            if (Date.now() - start > MAX_RUNTIME_MS) { // safety: release the rest
                await admin.from("reminder_messages").update({ status: "pending", updated_at: new Date().toISOString() }).eq("id", messages[i].id)
                continue
            }
            if (i > 0) await sleep(spacing)
            const m = messages[i]
            const out = await sendOne(KWIC_BASE_URL, KWIC_API_KEY, KWIC_TEMPLATE_ID, run.month_name, m)

            if (out.kind === "sent") {
                await admin.from("reminder_messages").update({
                    status: "sent", kwic_message_id: out.messageId, kwic_response: out.response,
                    sent_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                }).eq("id", m.id)
                sent++
            } else if (out.kind === "failed") {
                await admin.from("reminder_messages").update({
                    status: "failed", error: out.error, kwic_response: out.response ?? null,
                    attempts: m.attempts + 1, updated_at: new Date().toISOString(),
                }).eq("id", m.id)
                failed++
            } else { // transient
                const attempts = m.attempts + 1
                if (attempts >= MAX_ATTEMPTS) {
                    await admin.from("reminder_messages").update({
                        status: "failed", error: out.error, attempts, updated_at: new Date().toISOString(),
                    }).eq("id", m.id)
                    failed++
                } else {
                    await admin.from("reminder_messages").update({
                        status: "pending", error: out.error, attempts, updated_at: new Date().toISOString(),
                    }).eq("id", m.id)
                }
                backoff = true // stop this tick; release rows we haven't touched yet
                for (let j = i + 1; j < messages.length; j++) {
                    await admin.from("reminder_messages").update({ status: "pending", updated_at: new Date().toISOString() }).eq("id", messages[j].id)
                }
                break
            }
        }

        // Recompute run counters + completion from the source of truth.
        const { data: all } = await admin.from("reminder_messages")
            .select("status").eq("run_id", run.id)
        const tally = { pending: 0, processing: 0, sent: 0, failed: 0, skipped: 0 } as Record<string, number>
        for (const r of all ?? []) tally[r.status] = (tally[r.status] ?? 0) + 1
        const remaining = tally.pending + tally.processing
        await admin.from("reminder_runs").update({
            sent_count: tally.sent, failed_count: tally.failed, skipped_count: tally.skipped,
            status: remaining === 0 ? "completed" : "running",
            completed_at: remaining === 0 ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
        }).eq("id", run.id)

        return json({ run_id: run.id, processed: messages.length, sent, failed, backoff, remaining })
    } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, 500)
    }
})
