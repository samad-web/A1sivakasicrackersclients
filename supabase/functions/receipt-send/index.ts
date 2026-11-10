// receipt-send: admin-triggered. Sends the payment-confirmation WhatsApp template for one
// order via WASI (KWIC was discontinued 2026-11-10), right after that order's payment is
// verified in the dashboard. Server-side so the WASI api key never ships in the JS bundle.
//
// Template payment_receipt_link (approved in WASI): "...payment for Invoice #{{1}}.
// Amount: ₹{{2}} ... Download your receipt: {{3}}". Params are positional.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
}

/** orders.number is a bare 10-digit string; WASI wants it 91-prefixed. */
function toKwicNumber(raw: unknown): string | null {
    const d = String(raw ?? "").replace(/\D/g, "")
    if (d.length === 10) return `91${d}`
    if (d.length === 12 && d.startsWith("91")) return d
    if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`
    return null // e.g. a +1 US number — skip rather than misroute
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

    try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
        const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!
        // Trimmed: secrets pasted into the Supabase dashboard have arrived with a trailing
        // newline before, which fails invisibly.
        const WASI_API_KEY = (Deno.env.get("WASI_API_KEY") ?? "").trim()
        if (!WASI_API_KEY) return json({ error: "WASI_API_KEY secret is not set" }, 500)
        const WASI_BASE_URL = (Deno.env.get("WASI_BASE_URL") ?? "https://wasi.sirahagents.com").trim()
        // client_id is the WASI account UUID (not a secret); must match the key's account.
        const WASI_CLIENT_ID = (Deno.env.get("WASI_CLIENT_ID") ?? "62f75306-3b3f-4b4e-91dc-cdb1ed375f8b").trim()
        const TEMPLATE = (Deno.env.get("WASI_RECEIPT_TEMPLATE") ?? "payment_receipt_link").trim()
        // Meta rejects an empty param, so a failed PDF upload still sends a usable message.
        const buildParams = (receiptNo: string, amount: string, url: string) =>
            ({ "1": receiptNo, "2": amount, "3": url || "will be shared with you shortly" })

        const admin = createClient(SUPABASE_URL, SERVICE_KEY)
        const authHeader = req.headers.get("Authorization") ?? ""
        const body = await req.json().catch(() => ({}))

        // Sends the template and returns WASI's reply; logs every failure so it shows in the
        // Supabase function logs. Errors come back as { error: { code, message } }.
        const send = async (phone: string, params: Record<string, string>, template = TEMPLATE) => {
            let res: Response
            try {
                res = await fetch(new URL("api/v1/messages", WASI_BASE_URL), {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${WASI_API_KEY}` },
                    body: JSON.stringify({ client_id: WASI_CLIENT_ID, to: phone, type: "template", template, params }),
                })
            } catch (e) {
                const error = `network: ${e instanceof Error ? e.message : String(e)}`
                console.error(`[receipt-send] ${error}`)
                return { error }
            }
            const text = await res.text()
            let parsed: Record<string, any> | null = null
            try { parsed = JSON.parse(text) } catch { /* reported below */ }
            const error = !res.ok ? `wasi ${res.status}: ${parsed?.error?.message ?? text.slice(0, 300)}`
                : !parsed?.id ? `unexpected response: ${text.slice(0, 300)}`
                : parsed.status === "failed" ? `failed: ${parsed.error_reason ?? "unknown"}`
                : null
            if (error) console.error(`[receipt-send] ${error} | template=${template} | reply=${text.slice(0, 500)}`)
            return { error, status: res.status, reply: parsed ?? text.slice(0, 500) }
        }

        // --- Diagnostic: dashboard "Test" with the service_role key, to the tester's own
        // phone. Touches no order or customer data. Body: {"test_phone": "9XXXXXXXXX"}
        if (body.test_phone) {
            // verify_jwt = true (config.toml): the gateway has already checked the signature,
            // so the role claim can be trusted.
            const token = authHeader.replace(/^Bearer\s+/i, "")
            let role = ""
            try { role = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role ?? "" } catch { /* not a JWT */ }
            if (role !== "service_role" && token !== SERVICE_KEY) {
                return json({ error: `test_phone needs the service_role key (got role "${role || "none"}")` }, 403)
            }
            const phone = toKwicNumber(body.test_phone)
            if (!phone) return json({ error: "test_phone is not an Indian mobile number" }, 400)
            const r = await send(phone, buildParams("TEST", "1", "https://example.com/test-receipt.pdf"))
            return json({ ok: !r.error, ...r, config: { base_url: WASI_BASE_URL, client_id: WASI_CLIENT_ID, template: TEMPLATE } })
        }

        // --- AuthZ: caller must be a signed-in admin, same rule as reminders-start ----
        const userClient = createClient(SUPABASE_URL, ANON_KEY, {
            global: { headers: { Authorization: authHeader } },
        })
        const { data: { user } } = await userClient.auth.getUser()
        if (!user?.email) return json({ error: "Not authenticated" }, 401)

        const { data: adminRow } = await admin
            .from("admins").select("email").eq("email", user.email).maybeSingle()
        if (!adminRow) return json({ error: "Not authorized" }, 403)

        // --- Inputs -------------------------------------------------------------------
        const orderId: string = body.order_id
        if (!orderId) return json({ error: "order_id is required" }, 400)

        // Read the customer from the DB rather than trusting the caller: the client may
        // not decide which number receives a message.
        const { data: order, error: orderErr } = await admin
            .from("orders").select("receipt_no,name,number,scheme,value,invoice_url").eq("id", orderId).maybeSingle()
        if (orderErr) throw orderErr
        if (!order) return json({ error: "Order not found" }, 404)

        // Prefer the URL the caller just uploaded; fall back to whatever is stored.
        const receiptUrl: string = body.receipt_url || order.invoice_url || ""

        const phone = toKwicNumber(order.number)
        if (!phone) return json({ skipped: true, reason: `unusable phone number "${order.number}"` })

        // --- Send ---------------------------------------------------------------------
        // Amount is the monthly instalment (order.scheme), NOT order.value which is the scheme
        // total. The receipt prints scheme too, and the two must agree.
        const r = await send(phone, buildParams(String(order.receipt_no), String(order.scheme), receiptUrl))
        if (r.error) return json({ error: r.error, response: r.reply }, 502)

        const reply = r.reply as Record<string, unknown>
        return json({ sent: true, message_id: String(reply.id), receipt_no: order.receipt_no })
    } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, 500)
    }
})
