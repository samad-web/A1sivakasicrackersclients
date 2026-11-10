import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { OrderActions } from './OrderActions';
import { RejoinBadge } from './RejoinBadge';
import { Order, PaymentStatusFilter } from '@/types/order';
import { useToggleOrderFlag, useAdvancePayment } from '@/hooks/useOrders';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, CopyPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { RejoinDialog } from './RejoinDialog';
import { cycleLabel } from '@/utils/cycle';

function PreviousReceipt({ order }: { order: Order }) {
  if (!order.previous_receipt_no) return null;
  return (
    <p className="text-[10px] font-semibold text-muted-foreground mt-0.5">
      Prev #{order.previous_receipt_no}
      {order.previous_cycle_year != null && ` · ${cycleLabel(order.previous_cycle_year)}`}
    </p>
  );
}

interface OrdersTableProps {
  orders: Order[];
  isLoading: boolean;
  isFetching: boolean;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;

  totalCount: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  paymentFilter: PaymentStatusFilter;
  onPaymentFilterChange: (filter: PaymentStatusFilter) => void;
  typeFilter: string;
  onTypeFilterChange: (type: string) => void;
  availableTypes?: string[];
  monthName: string;
  cycleMonths: { val: string; label: string }[];
  currentMonth: string;
  isReadOnly?: boolean;
  onSelectAllMatching?: () => Promise<string[]>;
}

export function OrdersTable({
  orders,
  isLoading,
  isFetching,
  page,
  pageSize,
  onPageChange,

  totalCount,
  searchQuery,
  onSearchChange,
  paymentFilter,
  onPaymentFilterChange,
  typeFilter,
  onTypeFilterChange,
  availableTypes = [],
  monthName,
  cycleMonths,
  currentMonth,
  isReadOnly,
  onSelectAllMatching,
}: OrdersTableProps) {
  const toggleFlag = useToggleOrderFlag();
  const advancePayment = useAdvancePayment();
  const [advanceOrder, setAdvanceOrder] = useState<Order | null>(null);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);

  // Rejoin selection: only past (read-only) cycles can be moved into the current one.
  const selectable = !!isReadOnly;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isRejoinOpen, setIsRejoinOpen] = useState(false);
  const [isSelectingAll, setIsSelectingAll] = useState(false);

  // A changed view hides rows, so drop the selection rather than act on rows staff can't see.
  const viewKey = `${currentMonth}|${searchQuery}|${paymentFilter}|${typeFilter}|${isReadOnly}`;
  const viewKeyRef = useRef(viewKey);
  viewKeyRef.current = viewKey;
  useEffect(() => {
    setSelected(new Set());
  }, [viewKey]);

  const pageIds = orders.map(o => o?.id).filter((id): id is string => !!id);
  const allPageSelected = pageIds.length > 0 && pageIds.every(id => selected.has(id));

  const togglePage = () => {
    setSelected(prev => {
      const next = new Set(prev);
      pageIds.forEach(id => (allPageSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllMatching = async () => {
    if (!onSelectAllMatching) return;
    setIsSelectingAll(true);
    const requestedFor = viewKey;
    try {
      const ids = await onSelectAllMatching();
      if (viewKeyRef.current === requestedFor) setSelected(new Set(ids));
    } catch (error) {
      toast.error('Could not load all matching records');
      console.error(error);
    } finally {
      setIsSelectingAll(false);
    }
  };

  // Get months from current month onwards in the cycle
  const currentMonthIndex = cycleMonths.findIndex(m => m.val === currentMonth);
  const remainingMonths = cycleMonths.slice(currentMonthIndex).map(m => {
    const d = new Date(m.val + '-01');
    return { val: m.val, name: d.toLocaleDateString('en-US', { month: 'long' }) };
  });

  const openAdvanceDialog = (order: Order) => {
    const unpaidMonths = remainingMonths.filter(m => {
      const payment = order.monthly_payments?.find(p => p.month_name === m.name);
      return !payment || payment.payment_status !== 'Completed';
    });
    setSelectedMonths(unpaidMonths.length > 0 ? [unpaidMonths[0].name] : []);
    setAdvanceOrder(order);
  };

  const handleAdvanceSubmit = () => {
    if (!advanceOrder || selectedMonths.length === 0) return;
    advancePayment.mutate({
      orderId: advanceOrder.id,
      monthNames: selectedMonths,
      order: advanceOrder,
    });
    setAdvanceOrder(null);
    setSelectedMonths([]);
  };

  const toggleMonth = (month: string) => {
    setSelectedMonths(prev =>
      prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month]
    );
  };

  const safePageSize = pageSize || 50;
  const totalPages = Math.ceil((totalCount || 0) / safePageSize);


  const clearFilters = () => {
    onSearchChange('');
    onPaymentFilterChange('all');
    onTypeFilterChange('all');
  };

  const formatCurrency = (amount: number) => {
    const value = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };
  // Only show full skeleton on initial empty load
  if (isLoading && (!orders || orders.length === 0)) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="bg-card rounded-lg border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-4 border-b last:border-b-0">
              <Skeleton className="h-12 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 transition-opacity duration-200 ${isFetching && orders.length > 0 ? 'opacity-60' : 'opacity-100'}`}>
      {/* Filters Section */}
      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between glass-panel p-4 rounded-xl">
        <div className="relative w-full lg:max-w-xs">

          <input
            type="text"
            placeholder="Search records..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-background/50 border-none ring-1 ring-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary transition-all shadow-sm"
          />
          {isFetching && (
            <div className="absolute right-3 top-2.5">
              <div className="h-4 w-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <select
            value={paymentFilter}
            onChange={(e) => onPaymentFilterChange(e.target.value as PaymentStatusFilter)}
            className="flex-1 lg:flex-none bg-background/50 border-none ring-1 ring-border rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary transition-all shadow-sm"
          >
            <option value="all">Verification Status</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unverified</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => onTypeFilterChange(e.target.value)}
            className="flex-1 lg:flex-none bg-background/50 border-none ring-1 ring-border rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary transition-all shadow-sm"
          >
            <option value="all">All Types</option>
            {availableTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="w-full lg:w-auto hover:bg-primary/5 text-muted-foreground"
          >
            Clear Filters
          </Button>
        </div>
      </div>

      {selectable && pageIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm px-1">
          <label className="flex items-center gap-2 font-medium xl:hidden">
            <input
              type="checkbox"
              checked={allPageSelected}
              onChange={togglePage}
              aria-label="Select all on this page"
              className="h-4 w-4 rounded border-primary/30 text-primary focus:ring-primary"
            />
            Select all on page
          </label>
          {allPageSelected && totalCount > selected.size && onSelectAllMatching && (
            <span className="text-muted-foreground">
              All {pageIds.length} on this page selected.{' '}
              <button
                onClick={selectAllMatching}
                disabled={isSelectingAll}
                className="font-bold text-primary hover:underline disabled:opacity-50"
              >
                {isSelectingAll ? 'Selecting...' : `Select all ${totalCount} matching`}
              </button>
            </span>
          )}
          {selected.size > pageIds.length && selected.size >= totalCount && (
            <span className="text-muted-foreground">All {selected.size} matching records selected.</span>
          )}
        </div>
      )}

      {/* Mobile/Tablet Card View (Hidden on large screens) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 xl:hidden">
        {(!orders || orders.length === 0) ? (
          <div className="col-span-full py-12 text-center premium-card">
            <p className="text-muted-foreground">No records found</p>
          </div>
        ) : (
          orders.map((order) => {
            if (!order) return null;

            const isVerified = Array.isArray(order.monthly_payments) &&
              order.monthly_payments.some(p => p?.month_name === monthName && p?.payment_status === 'Completed');

            return (
              <div key={order.id || Math.random().toString()} className="premium-card p-4 space-y-3 relative overflow-hidden group">
                {(order.type === '12 Months') && (
                  <div className="absolute top-0 right-0 px-2 py-0.5 text-[8px] font-black uppercase tracking-tighter type-badge-12months rounded-bl-lg">
                    12-Month Priority
                  </div>
                )}
                <div className="flex justify-between items-start">
                  {selectable && order.id && (
                    <input
                      type="checkbox"
                      checked={selected.has(order.id)}
                      onChange={() => toggleOne(order.id)}
                      aria-label={`Select ${order.name}`}
                      className="h-5 w-5 mr-3 mt-1 shrink-0 rounded border-primary/30 text-primary focus:ring-primary"
                    />
                  )}
                  <div className="flex-1">
                    <p className="font-mono text-[10px] font-bold text-primary/60">{order.receipt_no || 'No Receipt'}</p>
                    <PreviousReceipt order={order} />
                    <h3 className="font-bold text-lg leading-tight mt-0.5">{order.name || 'Unknown'}</h3>
                    <p className="text-sm text-muted-foreground">{order.number || 'No Number'}</p>
                    {order.customer_address && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{order.customer_address}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="font-black text-lg text-primary">
                      {formatCurrency(order.value || 0)}
                    </div>
                    <div className="flex border-none items-center gap-2">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">Verified</span>
                      <input
                        type="checkbox"
                        checked={isVerified}
                        onChange={(e) => {
                          if (order.id) {
                            toggleFlag.mutate({
                              orderId: order.id,
                              field: 'payment_verified',
                              value: e.target.checked,
                              order: order,
                              monthName
                            });
                          }
                        }}
                        disabled={toggleFlag.isPending || isReadOnly}
                        className="h-5 w-5 rounded-md border-emerald-500/20 text-emerald-500 focus:ring-emerald-500 transition-all active:scale-90"
                      />
                    </div>
                    {!isReadOnly && (
                      <button
                        onClick={() => openAdvanceDialog(order)}
                        className="text-[10px] font-bold text-primary hover:underline"
                      >
                        Advance Pay
                      </button>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Scheme / District</span>
                    <span className="text-sm font-medium">
                      {order.scheme || 'N/A'} • <span className="text-muted-foreground">{order.district || 'N/A'}</span>
                    </span>
                    <span className="mt-1"><RejoinBadge score={order.rejoin_score} tier={order.rejoin_tier} compact /></span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Payment</span>
                    <span className="text-xs font-bold bg-muted px-2 py-0.5 rounded-full">{order.payment_mode || 'N/A'}</span>
                  </div>
                  {order.id && <OrderActions order={order} isReadOnly={isReadOnly} />}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Table View (Visible only on large screens) */}
      <div className="hidden xl:block premium-card overflow-hidden">

        <div className="overflow-x-auto">
          {/* Fixed layout: every column but Customer has a set width, so the address wraps and the table never overflows. */}
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="bg-table-header/50 border-b hover:bg-table-header/50">
                {selectable && (
                  <TableHead className="w-12 py-4">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={togglePage}
                      aria-label="Select all on this page"
                      className="h-4 w-4 rounded border-primary/30 text-primary focus:ring-primary"
                    />
                  </TableHead>
                )}
                <TableHead className="w-[110px] font-bold py-4">Receipt No</TableHead>
                <TableHead className="font-bold py-4">Customer / Address</TableHead>
                <TableHead className="w-[210px] font-bold py-4">Scheme/Type</TableHead>
                <TableHead className="w-[120px] font-bold py-4">Payment Mode</TableHead>
                <TableHead className="w-[130px] text-right font-bold py-4">Value</TableHead>
                <TableHead className="w-[120px] text-center font-bold py-4">Rejoin</TableHead>
                <TableHead className="w-[100px] text-center font-bold py-4">Verified</TableHead>
                <TableHead className="w-[110px] text-right font-bold py-4 pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={selectable ? 9 : 8} className="text-center py-20">
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-lg font-medium">No results matched your search</p>
                      <p className="text-sm text-muted-foreground">Try adjusting your filters or search terms</p>
                      <Button variant="outline" size="sm" onClick={clearFilters} className="mt-2">Reset All Filters</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((order) => (
                  <TableRow key={order.id} className="group hover:bg-primary/[0.02] transition-colors border-b last:border-0">
                    {selectable && (
                      <TableCell className="py-4">
                        <input
                          type="checkbox"
                          checked={selected.has(order.id)}
                          onChange={() => toggleOne(order.id)}
                          aria-label={`Select ${order.name}`}
                          className="h-4 w-4 rounded border-primary/30 text-primary focus:ring-primary"
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-mono text-xs font-black text-muted-foreground py-4">
                      {order.receipt_no}
                      <PreviousReceipt order={order} />
                    </TableCell>
                    <TableCell className="py-4">
                      <div>
                        <p className="font-bold text-base group-hover:text-primary transition-colors">{order.name}</p>
                        <p className="text-xs text-muted-foreground font-medium">{order.number}</p>
                        {order.customer_address && (
                          <p className="text-[11px] text-muted-foreground mt-1 whitespace-normal break-words">{order.customer_address}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="text-sm">
                        <p className="font-semibold">{order.scheme}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className={`status-badge ${order.type === '12 Months' ? 'type-badge-12months' : 'bg-muted text-muted-foreground'}`}>
                            {order.type}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">{order.district}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <span className="text-xs font-bold bg-muted px-2 py-1 rounded-lg uppercase tracking-wider text-muted-foreground">
                        {order.payment_mode || 'N/A'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-black text-lg py-4">
                      {formatCurrency(order.value)}
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="flex justify-center">
                        <RejoinBadge score={order.rejoin_score} tier={order.rejoin_tier} />
                      </div>
                    </TableCell>
                    <TableCell className="text-center py-4">
                      <div className="flex flex-col items-center gap-1">
                        <input
                          type="checkbox"
                          checked={order.monthly_payments?.some(p => p.month_name === monthName && p.payment_status === 'Completed')}
                          onChange={(e) => toggleFlag.mutate({
                            orderId: order.id,
                            field: 'payment_verified',
                            value: e.target.checked,
                            order: order,
                            monthName
                          })}
                          disabled={toggleFlag.isPending || isReadOnly}
                          className="h-5 w-5 rounded-md border-emerald-500/20 text-emerald-500 focus:ring-emerald-500 transition-all hover:scale-110 active:scale-90"
                        />
                        {!isReadOnly && (
                          <button
                            onClick={() => openAdvanceDialog(order)}
                            className="text-[10px] font-bold text-primary hover:underline"
                          >
                            Advance
                          </button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right py-4 pr-6">
                      <OrderActions order={order} isReadOnly={isReadOnly} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination Controls */}
      {
        totalPages > 1 && (
          <div className="flex items-center justify-between px-2 py-4">
            <p className="text-sm text-muted-foreground font-medium">
              Showing <span className="font-bold text-foreground">{page * pageSize + 1}</span> to <span className="font-bold text-foreground">{Math.min((page + 1) * pageSize, totalCount)}</span> of <span className="font-bold text-foreground">{totalCount}</span> results
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(page - 1)}
                disabled={page === 0}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-1">
                {Number.isFinite(totalPages) && Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                  // Simplified pagination: showing first 5 pages for now
                  return (
                    <Button
                      key={i}
                      variant={page === i ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => onPageChange(i)}
                      className="h-8 w-8 p-0 text-xs font-bold"
                    >
                      {i + 1}
                    </Button>
                  );
                })}
                {totalPages > 5 && <span className="text-muted-foreground px-1">...</span>}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages - 1}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )
      }
      {selectable && selected.size > 0 && (
        <div className="sticky bottom-4 z-40 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-lg">
          <span className="text-sm font-bold">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
            <Button size="sm" onClick={() => setIsRejoinOpen(true)}>
              <CopyPlus className="mr-2 h-4 w-4" />
              Add to Current Cycle
            </Button>
          </div>
        </div>
      )}

      <RejoinDialog
        orderIds={[...selected]}
        open={isRejoinOpen}
        onOpenChange={setIsRejoinOpen}
        onDone={() => setSelected(new Set())}
      />

      {/* Advance Payment Dialog */}
      <Dialog open={!!advanceOrder} onOpenChange={(open) => { if (!open) { setAdvanceOrder(null); setSelectedMonths([]); } }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-lg font-black">Advance Payment</DialogTitle>
            <p className="text-sm text-muted-foreground">{advanceOrder?.name} — {advanceOrder?.receipt_no}</p>
          </DialogHeader>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {remainingMonths.map(m => {
              const isPaid = advanceOrder?.monthly_payments?.some(p => p.month_name === m.name && p.payment_status === 'Completed');
              return (
                <label key={m.val} className={`flex items-center gap-2 text-sm py-1.5 px-2 rounded hover:bg-muted cursor-pointer ${isPaid ? 'opacity-50' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isPaid || selectedMonths.includes(m.name)}
                    disabled={isPaid}
                    onChange={() => toggleMonth(m.name)}
                    className="h-4 w-4 rounded border-primary/20 text-primary focus:ring-primary"
                  />
                  <span>{m.name}</span>
                  {isPaid && <span className="text-[10px] text-emerald-500 ml-auto font-bold">Paid</span>}
                </label>
              );
            })}
          </div>
          <Button
            className="w-full"
            disabled={selectedMonths.length === 0 || advancePayment.isPending}
            onClick={handleAdvanceSubmit}
          >
            {advancePayment.isPending ? 'Processing...' : `Verify ${selectedMonths.length} month(s)`}
          </Button>
        </DialogContent>
      </Dialog>
    </div >
  );
}
