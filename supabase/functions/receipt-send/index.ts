// receipt-send: admin-triggered. Sends the payment-confirmation WhatsApp template for one
// order via KWIC, right after that order's payment is verified in the dashboard.
//
// This is an edge function rather than a browser fetch for two reasons, both established by
// probing KWIC live on 2026-08-03:
//   1. app.kwic.in serves NO CORS headers (access-control-allow-origin is null on both the
//      preflight and the POST), so a browser can never call it.
//   2. the api key would otherwise ship inside the public JS bundle.
//
// The receipt travels as a LINK in a body variable, not as an attachment. Attaching it is
// impossible with this API, established by probing on 2026-08-04:
//   - api/v1/push has no per-message document override. Against a template WITH a document
//     header, whatsapp.document.link / document / media_url / document_url /
//     header_document_url / media were all ignored and every send delivered the template's
//     approval sample — i.e. one customer's receipt to everyone.
//   - api/v1/chat IS the free-form route (session_id in the QUERY, Meta Cloud API body) but
//     delivers nothing: free-form needs the 24h window that only a customer's own inbound
//     message opens, and ours have not messaged us.
// Named variables do substitute reliably, so KWIC_RECEIPT_URL_VAR names the placeholder that
// carries the receipt URL.
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

/** orders.number is a bare 10-digit string; KWIC wants it 91-prefixed. */
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
        // newline before, and a template id or api key with invisible whitespace fails in
        // ways the dashboard gives you no way to see.
        const KWIC_BASE_URL = Deno.env.get("KWIC_BASE_URL")!.trim()
        const KWIC_API_KEY = Deno.env.get("KWIC_API_KEY")!.trim()
        // Distinct from KWIC_TEMPLATE_ID, which is the unpaid-reminder template.
        const TEMPLATE_ID = (Deno.env.get("KWIC_RECEIPT_TEMPLATE_ID") ?? "payment_reminder_new").trim()
        // Named template variable carrying the receipt link, e.g. "Receipt" for a body
        // reading "Download your receipt: {{Receipt}}". Unset = text-only message.
        //
        // This is how the receipt reaches the customer, because api/v1/push has NO
        // per-message document override: probed 2026-08-04 against a template with a real
        // document header, and whatsapp.document.link / document / media_url / document_url /
        // header_document_url / media were ALL ignored — every send delivered the template's
        // approval sample instead. Variables, by contrast, are proven to substitute.
        const URL_VAR = (Deno.env.get("KWIC_RECEIPT_URL_VAR") ?? "").trim()

        const admin = createClient(SUPABASE_URL, SERVICE_KEY)
        const authHeader = req.headers.get("Authorization") ?? ""
        const body = await req.json().catch(() => ({}))

        // Sends the template and returns KWIC's raw reply; logs every failure so it shows in
        // the Supabase function logs (the dashboard toast alone was easy to miss).
        const send = async (phone: string, variable: Record<string, string>, templateId = TEMPLATE_ID) => {
            const url = new URL("api/v1/push", KWIC_BASE_URL)
            url.searchParams.set("api_key", KWIC_API_KEY)
            let res: Response
            try {
                res = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ mobile_number: phone, variable, template_id: templateId }),
                })
            } catch (e) {
                const error = `network: ${e instanceof Error ? e.message : String(e)}`
                console.error(`[receipt-send] ${error}`)
                return { error }
            }
            const text = await res.text()
            let parsed: Record<string, unknown> | null = null
            try { parsed = JSON.parse(text) } catch { /* reported below */ }
            const error = !res.ok ? `kwic ${res.status}: ${text.slice(0, 300)}`
                : !parsed ? `non-JSON response: ${text.slice(0, 300)}`
                : !parsed.message_id ? "not dispatched (message_id null)"
                : null
            if (error) console.error(`[receipt-send] ${error} | template=${templateId} vars=${Object.keys(variable).join(",")} | reply=${text.slice(0, 500)}`)
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
            // Optional overrides so template/variable combinations can be tried without a redeploy.
            const variable: Record<string, string> = body.variables ?? {
                Scheme: "TEST",
                Amount: "1",
                ...(URL_VAR ? { [URL_VAR]: "https://example.com/test-receipt.pdf" } : {}),
            }
            const templateId = String(body.template_id ?? TEMPLATE_ID)
            const r = await send(phone, variable, templateId)
            return json({
                ok: !r.error, ...r, sent_variables: variable, sent_template: templateId,
                config: { base_url: KWIC_BASE_URL, template_id: TEMPLATE_ID, url_var: URL_VAR || null, api_key_set: !!KWIC_API_KEY },
            })
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
        // Named template variables — "Payment Confirmation! We've received your payment for
        // Invoice #{{Scheme}}. Amount: ₹{{Amount}}". Confirmed dispatching live on 2026-08-03.
        const r = await send(phone, {
            Scheme: String(order.receipt_no),
            // The monthly instalment (order.scheme), NOT order.value which is the scheme total.
            // The receipt prints scheme too, and the two must agree.
            Amount: String(order.scheme),
            ...(URL_VAR && receiptUrl ? { [URL_VAR]: receiptUrl } : {}),
        })
        // 200 + message_id:null means accepted-but-never-dispatched. That is a failure, and
        // retrying it just re-spams the customer.
        if (r.error) return json({ error: r.error, response: r.reply }, 502)

        const reply = r.reply as Record<string, unknown>
        return json({ sent: true, message_id: String(reply.message_id), receipt_no: order.receipt_no })
    } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, 500)
    }
})
