import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { OrdersTable } from './OrdersTable';
import { RejoinDialog } from './RejoinDialog';
import { OrderActions } from './OrderActions';
import { fetchMatchingOrderIds } from '@/hooks/useOrders';
import { cycleLabel } from '@/utils/cycle';
import type { Order } from '@/types/order';

const rpc = vi.fn();
const from = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a), from: (...a: unknown[]) => from(...a) },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const wrap = (ui: ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{ui}</QueryClientProvider>);

const order = (id: string, extra: Partial<Order> = {}): Order => ({
  id, receipt_no: id.toUpperCase(), scheme: '500', value: 6000, name: `Cust ${id}`, number: `98${id}`,
  secondary_number: null, type: '12 Months', district: 'X', current_month: null, customer_address: null,
  address_line1: null, address_line2: null, city: null, pincode: null, state: null, payment_mode: null,
  payment_verified: false, order_completed: false, invoice_url: null, rejoin_score: null, rejoin_tier: null,
  created_at: '', updated_at: '', monthly_payments: [], ...extra,
});

const tableProps = {
  orders: [order('a'), order('b')],
  isLoading: false, isFetching: false, page: 0, pageSize: 2, onPageChange: vi.fn(),
  totalCount: 5, searchQuery: '', onSearchChange: vi.fn(), paymentFilter: 'all' as const,
  onPaymentFilterChange: vi.fn(), typeFilter: 'all', onTypeFilterChange: vi.fn(),
  monthName: 'November', cycleMonths: [{ val: '2025-11', label: 'November 2025' }], currentMonth: '2025-11',
};

const rowBox = (name: string) => screen.getAllByLabelText(`Select ${name}`)[0] as HTMLInputElement;

beforeEach(() => { rpc.mockReset(); from.mockReset(); });

describe('Rejoin Next Cycle', () => {
  it('AC1: selection checkboxes appear on archived cycles only', () => {
    const { unmount } = wrap(<OrdersTable {...tableProps} isReadOnly />);
    expect(screen.getAllByLabelText('Select all on this page').length).toBeGreaterThan(0);
    unmount();
    wrap(<OrdersTable {...tableProps} isReadOnly={false} />);
    expect(screen.queryByLabelText('Select all on this page')).toBeNull();
    expect(screen.queryByLabelText('Select Cust a')).toBeNull();
  });

  it('AC2: header checkbox selects the page, then "Select all N matching" selects across pages', async () => {
    const onSelectAllMatching = vi.fn().mockResolvedValue(['a', 'b', 'c', 'd', 'e']);
    wrap(<OrdersTable {...tableProps} isReadOnly onSelectAllMatching={onSelectAllMatching} />);

    fireEvent.click(screen.getAllByLabelText('Select all on this page')[0]);
    expect(rowBox('Cust a').checked).toBe(true);
    expect(rowBox('Cust b').checked).toBe(true);
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Select all 5 matching'));
    await screen.findByText('5 selected');
    expect(onSelectAllMatching).toHaveBeenCalledOnce();
  });

  it('AC2: single row toggles on and off', () => {
    wrap(<OrdersTable {...tableProps} isReadOnly />);
    fireEvent.click(rowBox('Cust a'));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    fireEvent.click(rowBox('Cust a'));
    expect(screen.queryByText('1 selected')).toBeNull();
  });

  it('AC7: selection clears when filters change', () => {
    const { rerender } = wrap(<OrdersTable {...tableProps} isReadOnly />);
    fireEvent.click(rowBox('Cust a'));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <OrdersTable {...tableProps} isReadOnly paymentFilter="verified" />
      </QueryClientProvider>
    );
    expect(screen.queryByText('1 selected')).toBeNull();
  });

  it('AC6: rejoined row shows previous receipt and cycle', () => {
    wrap(<OrdersTable {...tableProps} orders={[order('a', { previous_receipt_no: '266', previous_cycle_year: 2025 })]} />);
    expect(screen.getAllByText(/Prev #266 · Cycle 2025-26/).length).toBeGreaterThan(0);
  });

  it('AC3/AC4/AC5: dialog calls rejoin_orders and reports added and skipped customers', async () => {
    rpc.mockResolvedValue({
      error: null,
      data: [
        { source_order_id: 'a', name: 'Cust a', old_receipt_no: '1', new_order_id: 'n1', new_receipt_no: '42', skip_reason: null, existing_receipt_no: null },
        { source_order_id: 'b', name: 'Cust b', old_receipt_no: '2', new_order_id: 'n2', new_receipt_no: '43', skip_reason: null, existing_receipt_no: null },
        { source_order_id: 'c', name: 'Cust c', old_receipt_no: '3', new_order_id: null, new_receipt_no: null, skip_reason: 'already_in_cycle', existing_receipt_no: '7' },
      ],
    });
    const onDone = vi.fn();
    wrap(<RejoinDialog orderIds={['a', 'b', 'c']} open onOpenChange={vi.fn()} onDone={onDone} />);

    fireEvent.click(screen.getByText('Add 3'));
    await screen.findByText(/Added 2 to/);
    expect(rpc).toHaveBeenCalledWith('rejoin_orders', { p_order_ids: ['a', 'b', 'c'] });
    expect(screen.getByText('New receipt numbers 42 – 43.')).toBeInTheDocument();
    expect(screen.getByText(/Cust c \(#3\): already in current cycle, receipt #7/)).toBeInTheDocument();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('Edge: failed rejoin keeps the confirm step and does not report success', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('boom') });
    const onDone = vi.fn();
    wrap(<RejoinDialog orderIds={['a']} open onOpenChange={vi.fn()} onDone={onDone} />);
    fireEvent.click(screen.getByText('Add 1'));
    await waitFor(() => expect(screen.getByText('Add 1')).not.toBeDisabled());
    expect(screen.queryByText(/Added/)).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('Edge: select-all-matching pages past the 1000-row API limit', async () => {
    const pages = [
      Array.from({ length: 1000 }, (_, i) => ({ id: `p1-${i}` })),
      [{ id: 'p2-0' }, { id: 'p2-1' }],
    ];
    const ranges: number[][] = [];
    const builder: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gte', 'lt', 'or', 'neq', 'ilike', 'order']) builder[m] = () => builder;
    builder.range = (a: number, b: number) => {
      ranges.push([a, b]);
      return Promise.resolve({ data: pages[ranges.length - 1], error: null });
    };
    from.mockReturnValue(builder);

    const ids = await fetchMatchingOrderIds({ monthName: 'November', cycleYear: 2025 });
    expect(ids).toHaveLength(1002);
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
  });

  it('AC5: row menu offers "Add to Current Cycle" on archived rows; Edit/Delete stay disabled', async () => {
    const { unmount } = wrap(<OrderActions order={order('a')} isReadOnly />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    const item = await screen.findByRole('menuitem', { name: /Add to Current Cycle/ });
    expect(screen.getByRole('menuitem', { name: /Edit Record/ })).toHaveAttribute('data-disabled');
    expect(screen.getByRole('menuitem', { name: /Delete Record/ })).toHaveAttribute('data-disabled');
    fireEvent.click(item);
    expect(await screen.findByText('Add 1')).toBeInTheDocument();
    unmount();

    wrap(<OrderActions order={order('a')} isReadOnly={false} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    await screen.findByRole('menuitem', { name: /Edit Record/ });
    expect(screen.queryByRole('menuitem', { name: /Add to Current Cycle/ })).toBeNull();
  });

  it('cycleLabel formats the cycle like the selector', () => {
    expect(cycleLabel(2025)).toBe('Cycle 2025-26');
  });
});
