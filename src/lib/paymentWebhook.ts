/**
 * Payment-verified side effects: generate the customer's receipt, host it, and WhatsApp
 * them a confirmation.
 *
 * This used to POST to an n8n webhook that built the receipt. n8n has been unpublished, so
 * the whole flow is ours: render the PDF in the browser, upload it to Supabase Storage,
 * record the URL on the order, then hand that URL to the receipt-send edge function.
 *
 * KWIC is called server-side because app.kwic.in serves no CORS headers and the api key must
 * not ship in the JS bundle — see supabase/functions/receipt-send/index.ts.
 *
 * Best-effort throughout: a failed receipt must never roll back a payment that was verified.
 */
import { toast } from 'sonner';
import { Order } from '@/types/order';
import { supabase } from '@/integrations/supabase/client';

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

  // filter(Boolean) drops the empty segments left by ",," runs in customer_address, which
  // otherwise print as a trailing ", ," on the receipt.
  const line1Parts = parts
    .filter((_, i) => i !== pinIndex && (pinIndex === -1 || i !== pinIndex - 1))
    .filter(Boolean);
  return {
    addressLine1: line1Parts.join(', '),
    addressLine2: [order.district, state, pincode].filter(Boolean).join(', '),
  };
}

export interface PaymentWebhookOptions {
  /** Month(s) the payment covers. One entry for a normal verify, many for an advance. */
  monthNames: string[];
  /** Only set for advance payments — labels the receipt as covering several months. */
  advanceMonths?: number;
}

/**
 * Field-for-field the payload the n8n receipt template was written against, so the rendered
 * receipt is identical to the ones customers already have.
 */
function buildReceiptData(order: Order, opts: PaymentWebhookOptions) {
  const { addressLine1, addressLine2 } = splitAddress(order);
  const year = new Date().getFullYear();

  return {
    receipt_no: order.receipt_no,
    date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    customer_name: order.name,
    contact_number: `91${order.number}`,
    address_line1: addressLine1,
    address_line2: addressLine2,
    scheme_name: order.scheme,
    scheme_details: order.type,
    month_label: opts.monthNames.map((m) => `${m} ${year}`).join(', '),
    payment_mode: order.payment_mode || 'Gpay',
  };
}

/**
 * Generate + host the receipt, then send the confirmation. Resolves once both have been
 * attempted; callers treat it as fire-and-forget so verifying a payment stays instant.
 */
export async function notifyPaymentVerified(
  order: Order,
  orderId: string,
  opts: PaymentWebhookOptions,
): Promise<void> {
  let receiptUrl: string | null = null;

  try {
    // Loaded on demand — html2canvas + jsPDF + the layout are a large chunk.
    const { generateReceiptPdf, uploadReceipt } = await import('@/lib/receiptPdf');
    const pdf = await generateReceiptPdf(buildReceiptData(order, opts));
    receiptUrl = await uploadReceipt(orderId, opts.monthNames, pdf);

    // Record it so the dashboard's Receipt link works and re-sends can reuse it.
    const { error } = await supabase.from('orders').update({ invoice_url: receiptUrl }).eq('id', orderId);
    if (error) console.error(`[Receipt] could not save invoice_url for ${order.receipt_no}:`, error);
  } catch (err) {
    console.error(`[Receipt] generation failed for ${order.receipt_no}:`, err);
    toast.warning('Payment saved, but the receipt could not be generated');
    // Fall through: the confirmation text is still worth sending without an attachment.
  }

  const { data, error } = await supabase.functions.invoke('receipt-send', {
    body: { order_id: orderId, month_names: opts.monthNames, receipt_url: receiptUrl },
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
  toast.success(`Receipt sent to ${order.name}`);
}
