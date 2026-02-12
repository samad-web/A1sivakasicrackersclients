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
import { Order, PaymentStatusFilter } from '@/types/order';
import { useToggleOrderFlag } from '@/hooks/useOrders';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface OrdersTableProps {
  orders: Order[];
  isLoading: boolean;
  isFetching: boolean;
  page: number;
  onPageChange: (page: number) => void;
  totalCount: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  paymentFilter: PaymentStatusFilter;
  onPaymentFilterChange: (filter: PaymentStatusFilter) => void;
  typeFilter: string;
  onTypeFilterChange: (type: string) => void;
}

export function OrdersTable({
  orders,
  isLoading,
  isFetching,
  page,
  onPageChange,
  totalCount,
  searchQuery,
  onSearchChange,
  paymentFilter,
  onPaymentFilterChange,
  typeFilter,
  onTypeFilterChange,
}: OrdersTableProps) {
  const toggleFlag = useToggleOrderFlag();
  const pageSize = 50;
  const totalPages = Math.ceil(totalCount / pageSize);

  const clearFilters = () => {
    onSearchChange('');
    onPaymentFilterChange('all');
    onTypeFilterChange('all');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Only show full skeleton on initial empty load
  if (isLoading && orders.length === 0) {
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
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between glass-panel p-4 rounded-xl">
        <div className="relative w-full md:max-w-xs">
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
        {/* ... existing filters ... */}
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <select
            value={paymentFilter}
            onChange={(e) => onPaymentFilterChange(e.target.value as PaymentStatusFilter)}
            className="flex-1 md:flex-none bg-background/50 border-none ring-1 ring-border rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary transition-all shadow-sm"
          >
            <option value="all">All Payment</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unverified</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => onTypeFilterChange(e.target.value)}
            className="flex-1 md:flex-none bg-background/50 border-none ring-1 ring-border rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary transition-all shadow-sm"
          >
            <option value="all">All Types</option>
            <option value="10 Months">10 Months</option>
            <option value="12 Months">12 Months</option>
          </select>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="w-full md:w-auto hover:bg-primary/5 text-muted-foreground"
          >
            Clear Filters
          </Button>
        </div>
      </div>

      {/* Mobile Card View (Hidden on Desktop) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:hidden">
        {orders.length === 0 ? (
          <div className="col-span-full py-12 text-center premium-card">
            <p className="text-muted-foreground">No records found</p>
          </div>
        ) : (
          orders.map((order) => (
            <div key={order.id} className="premium-card p-4 space-y-3 relative overflow-hidden group">
              {order.type === '12 Months' && (
                <div className="absolute top-0 right-0 px-2 py-0.5 text-[8px] font-black uppercase tracking-tighter type-badge-12months rounded-bl-lg">
                  12-Month Priority
                </div>
              )}
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-mono text-[10px] font-bold text-primary/60">{order.receipt_no}</p>
                  <h3 className="font-bold text-lg leading-tight mt-0.5">{order.name}</h3>
                  <p className="text-sm text-muted-foreground">{order.number}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="font-black text-lg text-primary">
                    {formatCurrency(order.value)}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Paid</span>
                    <input
                      type="checkbox"
                      checked={order.payment_verified}
                      onChange={(e) => toggleFlag.mutate({
                        orderId: order.id,
                        field: 'payment_verified',
                        value: e.target.checked,
                        order: order
                      })}
                      disabled={toggleFlag.isPending}
                      className="h-5 w-5 rounded-md border-primary/20 text-primary focus:ring-primary transition-all active:scale-90"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Scheme / District</span>
                  <span className="text-sm font-medium">{order.scheme} • <span className="text-muted-foreground">{order.district}</span></span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Payment</span>
                  <span className="text-xs font-bold bg-muted px-2 py-0.5 rounded-full">{order.payment_mode || 'N/A'}</span>
                </div>
                <OrderActions order={order} />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table View (Hidden on Mobile) */}
      <div className="hidden md:block premium-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-table-header/50 border-b hover:bg-table-header/50">
                <TableHead className="w-[120px] font-bold py-4">Receipt No</TableHead>
                <TableHead className="font-bold py-4">Customer</TableHead>
                <TableHead className="font-bold py-4">Scheme/Type</TableHead>
                <TableHead className="font-bold py-4">Payment Mode</TableHead>
                <TableHead className="text-right font-bold py-4">Value</TableHead>
                <TableHead className="text-center font-bold py-4">Paid</TableHead>
                <TableHead className="text-right font-bold py-4 pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-20">
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
                    <TableCell className="font-mono text-xs font-black text-muted-foreground py-4">
                      {order.receipt_no}
                    </TableCell>
                    <TableCell className="py-4">
                      <div>
                        <p className="font-bold text-base group-hover:text-primary transition-colors">{order.name}</p>
                        <p className="text-xs text-muted-foreground font-medium">{order.number}</p>
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="text-sm">
                        <p className="font-semibold">{order.scheme}</p>
                        <div className="flex items-center gap-1.5 mt-1">
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
                    <TableCell className="text-center py-4">
                      <input
                        type="checkbox"
                        checked={order.payment_verified}
                        onChange={(e) => toggleFlag.mutate({
                          orderId: order.id,
                          field: 'payment_verified',
                          value: e.target.checked,
                          order: order
                        })}
                        disabled={toggleFlag.isPending}
                        className="h-5 w-5 rounded-md border-primary/20 text-primary focus:ring-primary transition-all hover:scale-110 active:scale-90"
                      />
                    </TableCell>
                    <TableCell className="text-right py-4 pr-6">
                      <OrderActions order={order} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
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
              {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
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
      )}
    </div>
  );
}
