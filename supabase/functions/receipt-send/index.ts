// receipt-send: admin-triggered. Sends the payment-confirmation WhatsApp template for one
// order via KWIC, right after that order's payment is verified in the dashboard.
//
// This is an edge function rather than a browser fetch for two reasons, both established by
// probing KWIC live on 2026-08-03:
//   1. app.kwic.in serves NO CORS headers (access-control-allow-origin is null on both the
//      preflight and the POST), so a browser can never call it.
//   2. the api key would otherwise ship inside the public JS bundle.
//
// Attaching the receipt PDF depends on the template having a real document header. With the
// text-only `payment_reminder_new`, api/v1/push silently ignored every attachment field tried
// (media_url / document / whatsapp.document / header_document_url each returned a normal
// message_id while delivering plain text), so KWIC_MEDIA_FIELD is unset by default and the
// message goes out as text. Once a header template exists, set KWIC_RECEIPT_TEMPLATE_ID to it
// and KWIC_MEDIA_FIELD to whatever key KWIC wants — no code change.
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

        // --- AuthZ: caller must be a signed-in admin, same rule as reminders-start ----
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

        // --- Inputs -------------------------------------------------------------------
        const body = await req.json().catch(() => ({}))
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
        const url = new URL("api/v1/push", KWIC_BASE_URL)
        url.searchParams.set("api_key", KWIC_API_KEY)

        let res: Response
        try {
            res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    mobile_number: phone,
                    // Named template variables — "Payment Confirmation! We've received your
                    // payment for Invoice #{{Scheme}}. Amount: ₹{{Amount}}". Confirmed
                    // dispatching live on 2026-08-03.
                    variable: {
                        Scheme: String(order.receipt_no),
                        // The monthly instalment (order.scheme), NOT order.value which is the scheme total.
                        // The receipt prints scheme too, and the two must agree.
                        Amount: String(order.scheme),
                        ...(URL_VAR && receiptUrl ? { [URL_VAR]: receiptUrl } : {}),
                    },
                    template_id: TEMPLATE_ID,
                }),
            })
        } catch (e) {
            return json({ error: `network: ${e instanceof Error ? e.message : String(e)}` }, 502)
        }

        const text = await res.text()
        if (!res.ok) return json({ error: `kwic ${res.status}: ${text.slice(0, 200)}` }, 502)

        let parsed: Record<string, unknown>
        try { parsed = JSON.parse(text) } catch {
            return json({ error: `non-JSON response: ${text.slice(0, 200)}` }, 502)
        }
        // 200 + message_id:null means accepted-but-never-dispatched. That is a failure, and
        // retrying it just re-spams the customer.
        if (!parsed.message_id) {
            return json({ error: "not dispatched (message_id null)", response: parsed }, 502)
        }

        return json({ sent: true, message_id: String(parsed.message_id), receipt_no: order.receipt_no })
    } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, 500)
    }
})
