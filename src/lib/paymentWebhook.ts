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
import { buildPassbook } from '@/lib/passbook';

export interface PaymentWebhookOptions {
  /** Month(s) the payment covers. One entry for a normal verify, many for an advance. */
  monthNames: string[];
  /** Only set for advance payments — labels the receipt as covering several months. */
  advanceMonths?: number;
}

/** The dashboard row only carries the filtered month, so read the whole plan fresh. */
async function loadPassbook(order: Order, orderId: string) {
  const { data, error } = await supabase
    .from('monthly_payments')
    .select('month_name, payment_status, payment_date')
    .eq('order_id', orderId);
  if (error) throw new Error(`could not load payments: ${error.message}`);
  return buildPassbook(order, data ?? []);
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
    const pdf = await generateReceiptPdf(await loadPassbook(order, orderId));
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
