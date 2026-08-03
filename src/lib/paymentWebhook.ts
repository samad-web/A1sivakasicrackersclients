/**
 * Payment-verified side effects: fire the n8n webhook that generates the receipt PDF, and
 * WhatsApp the customer a payment confirmation.
 *
 * The WhatsApp send goes through the `receipt-send` edge function, not straight to KWIC:
 * app.kwic.in serves no CORS headers, so the browser cannot call it at all, and the api key
 * must not ship in the JS bundle. The PDF itself is not attached to the message — see the
 * note at the top of supabase/functions/receipt-send/index.ts.
 *
 * Everything here is best-effort: a failed message must never roll back a payment that was
 * actually verified.
 */
import { toast } from 'sonner';
import { Order } from '@/types/order';
import { supabase } from '@/integrations/supabase/client';

const WEBHOOK_URL = 'https://n8n.srv930949.hstgr.cloud/webhook/payment-webhook';

/** Splits the single customer_address string back into the two lines the receipt expects. */
function splitAddress(order: Order): { addressLine1: string; addressLine2: string } {
  const parts = (order.customer_address || '').split(',').map((p) => p.trim());
  let pincode = '';
  let state = '';

  const pinIndex = parts.findIndex((p) => p.startsWith('Pin - '));
  if (pinIndex !== -1) {
    pincode = parts[pinIndex].replace('Pin - ', '');
    if (pinIndex > 0) state = parts[pinIndex - 1];
  }

  const line1Parts = parts.filter((_, i) => i !== pinIndex && (pinIndex === -1 || i !== pinIndex - 1));
  return {
    addressLine1: line1Parts.join(', '),
    addressLine2: [order.district, state, pincode].filter(Boolean).join(', '),
  };
}

export interface PaymentWebhookOptions {
  /** Month(s) the payment covers. One entry for a normal verify, many for an advance. */
  monthNames: string[];
  /** Only set for advance payments — n8n uses it to label the receipt. */
  advanceMonths?: number;
}

function buildPayload(order: Order, orderId: string, opts: PaymentWebhookOptions) {
  const { addressLine1, addressLine2 } = splitAddress(order);
  const year = new Date().getFullYear();

  return {
    order_completed: order.order_completed || false,
    payment_verified: true,
    id: orderId,
    receipt_no: order.receipt_no,
    date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    customer_name: order.name,
    contact_number: `91${order.number}`,
    secondary_number: order.secondary_number || '',
    address_line1: addressLine1,
    address_line2: addressLine2,
    scheme_name: order.scheme,
    scheme_details: order.type,
    value: order.value,
    amount_paid: String(order.value),
    district: order.district || '',
    month_label: opts.monthNames.map((m) => `${m} ${year}`).join(', '),
    month_name: opts.monthNames.join(', '),
    payment_mode: order.payment_mode || 'Gpay',
    invoice_url: order.invoice_url || '',
    created_at: order.created_at,
    updated_at: order.updated_at,
    ...(opts.advanceMonths ? { advance_months: opts.advanceMonths } : {}),
  };
}

/**
 * Generate the receipt and WhatsApp the confirmation. Resolves once both have been
 * attempted; callers treat it as fire-and-forget so verifying a payment stays instant.
 */
export async function notifyPaymentVerified(
  order: Order,
  orderId: string,
  opts: PaymentWebhookOptions,
): Promise<void> {
  // Receipt generation. Independent of the WhatsApp send — n8n stores the PDF and the app
  // surfaces it later via orders.invoice_url.
  fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildPayload(order, orderId, opts)),
  }).catch((err) => console.error('[Webhook] Trigger failed:', err));

  const { data, error } = await supabase.functions.invoke('receipt-send', {
    body: { order_id: orderId, month_names: opts.monthNames },
  });

  if (error) {
    console.error(`[Receipt] ${order.receipt_no}:`, error);
    toast.error(`Payment saved, but the WhatsApp confirmation failed: ${error.message}`);
    return;
  }
  if (data?.skipped) {
    console.warn(`[Receipt] ${order.receipt_no} skipped: ${data.reason}`);
    toast.warning(`Confirmation not sent: ${data.reason}`);
    return;
  }
  if (data?.error) {
    console.error(`[Receipt] ${order.receipt_no}: ${data.error}`, data.response);
    toast.error(`WhatsApp confirmation failed: ${data.error}`);
    return;
  }
  toast.success(`Payment confirmation sent to ${order.name}`);
}
