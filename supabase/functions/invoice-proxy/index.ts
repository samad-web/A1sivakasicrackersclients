import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const N8N_WEBHOOK_URL = 'https://n8n.srv930949.hstgr.cloud/webhook/payment-webhook';

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const body = await req.json()
        const targetUrl = body.webhook_url || N8N_WEBHOOK_URL;

        // Mode 1: Direct payload forwarding
        // If payload already has receipt_no, forward it directly
        if (body.receipt_no) {
            // Remove webhook_url from payload before forwarding to n8n if you don't want n8n to see it
            const { webhook_url, ...payloadToForward } = body;

            const n8nRes = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payloadToForward),
            });

            const n8nData = await n8nRes.text();

            return new Response(JSON.stringify({ success: true, n8nResponse: n8nData }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // Mode 2: Legacy toggle mode (used by useToggleOrderFlag)
        const { orderId, field, value } = body

        // We only trigger for payment_verified = true
        if (field !== 'payment_verified' || value !== true) {
            return new Response(JSON.stringify({ message: 'Skipping' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

        // Fetch order details
        const res = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${orderId}&select=*`, {
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
            }
        })

        const orders = await res.json()
        const fullOrder = orders[0]

        if (!fullOrder) {
            throw new Error('Order not found')
        }

        // Formatting Logic
        const date = new Date().toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });

        const monthLabel = new Date(fullOrder.current_month + '-01').toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric'
        });

        const addrLines = (fullOrder.customer_address || '').split('\n').filter(Boolean);
        const address_line1 = addrLines[0] || '';
        const address_line2 = addrLines.slice(1).join(', ') || '';

        const payload = {
            payment_completed: true,
            receipt_no: fullOrder.receipt_no,
            date: date,
            customer_name: fullOrder.name,
            contact_number: `91${fullOrder.number}`,
            address_line1: address_line1,
            address_line2: address_line2,
            scheme_details: fullOrder.type,
            scheme_name: fullOrder.scheme,
            month_label: monthLabel,
            amount_paid: String(fullOrder.value),
            payment_mode: fullOrder.payment_mode || 'Gpay'
        };

        // Forward to n8n
        const n8nRes = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const n8nData = await n8nRes.text();

        return new Response(JSON.stringify({ success: true, n8nResponse: n8nData }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
