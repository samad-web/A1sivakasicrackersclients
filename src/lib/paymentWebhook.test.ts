import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { notifyPaymentVerified } from './paymentWebhook';
import type { Order } from '@/types/order';

const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}));
vi.mock('@/lib/receiptPdf', () => ({
  generateReceiptPdf: () => Promise.resolve(new Blob()),
  uploadReceipt: () => Promise.resolve('https://example.invalid/r.pdf'),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const order = { id: 'o1', receipt_no: '9', name: 'Cust', number: '9876543210', scheme: '500', value: 6000, type: '12 Months', created_at: '2026-11-03' } as Order;

beforeEach(() => { invoke.mockReset(); Object.values(toast).forEach(f => f.mockReset()); });

describe('WhatsApp confirmation errors', () => {
  it('shows the edge function\'s real reason instead of "non-2xx status code"', async () => {
    const res = new Response(JSON.stringify({ error: 'kwic 401: invalid api key' }), { status: 502 });
    invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(res) });

    await notifyPaymentVerified(order, 'o1', { monthNames: ['November'] });

    expect(toast.error).toHaveBeenCalledWith(
      'Payment saved, but the WhatsApp confirmation failed: kwic 401: invalid api key',
      expect.anything(),
    );
  });

  it('falls back to the generic message when the body is not JSON', async () => {
    invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(new Response('oops', { status: 500 })) });
    await notifyPaymentVerified(order, 'o1', { monthNames: ['November'] });
    expect(toast.error.mock.calls[0][0]).toMatch(/^Payment saved, but the WhatsApp confirmation failed: .+/);
  });

  it('reports success when the message is sent', async () => {
    invoke.mockResolvedValue({ data: { sent: true }, error: null });
    await notifyPaymentVerified(order, 'o1', { monthNames: ['November'] });
    expect(toast.success).toHaveBeenCalledWith('Receipt sent to Cust');
  });
});
