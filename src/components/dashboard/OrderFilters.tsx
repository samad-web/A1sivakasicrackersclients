import { Search, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PaymentStatusFilter,
  OrderStatusFilter,
  InvoiceFilter,
  VerifiedFilter,
} from '@/types/order';

interface OrderFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  paymentFilter: PaymentStatusFilter;
  onPaymentFilterChange: (value: PaymentStatusFilter) => void;
  orderFilter: OrderStatusFilter;
  onOrderFilterChange: (value: OrderStatusFilter) => void;
  invoiceFilter: InvoiceFilter;
  onInvoiceFilterChange: (value: InvoiceFilter) => void;
  verifiedFilter: VerifiedFilter;
  onVerifiedFilterChange: (value: VerifiedFilter) => void;
  onClearFilters: () => void;
}

export function OrderFilters({
  searchQuery,
  onSearchChange,
  paymentFilter,
  onPaymentFilterChange,
  orderFilter,
  onOrderFilterChange,
  invoiceFilter,
  onInvoiceFilterChange,
  verifiedFilter,
  onVerifiedFilterChange,
  onClearFilters,
}: OrderFiltersProps) {
  const hasActiveFilters =
    paymentFilter !== 'all' ||
    orderFilter !== 'all' ||
    invoiceFilter !== 'all' ||
    verifiedFilter !== 'all' ||
    searchQuery !== '';

  return (
    <div className="bg-card rounded-lg border p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Filters</span>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="ml-auto text-xs h-7"
          >
            Clear all
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="relative lg:col-span-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, order ID..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={paymentFilter} onValueChange={onPaymentFilterChange}>
          <SelectTrigger>
            <SelectValue placeholder="Payment Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Payments</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
          </SelectContent>
        </Select>

        <Select value={orderFilter} onValueChange={onOrderFilterChange}>
          <SelectTrigger>
            <SelectValue placeholder="Order Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Orders</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <Select value={invoiceFilter} onValueChange={onInvoiceFilterChange}>
          <SelectTrigger>
            <SelectValue placeholder="Invoice Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Invoices</SelectItem>
            <SelectItem value="invoiced">Invoiced</SelectItem>
            <SelectItem value="not_invoiced">Not Invoiced</SelectItem>
          </SelectContent>
        </Select>

        <Select value={verifiedFilter} onValueChange={onVerifiedFilterChange}>
          <SelectTrigger>
            <SelectValue placeholder="Verification" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="unverified">Unverified</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
