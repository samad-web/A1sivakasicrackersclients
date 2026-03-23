import { useState, useMemo, useEffect } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OrdersTable } from '@/components/dashboard/OrdersTable';
import { DashboardStats } from '@/components/dashboard/DashboardStats';
import { SettingsDialog } from '@/components/dashboard/SettingsDialog';
import { OrderForm } from '@/components/dashboard/OrderForm';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useOrders, useOrderStats, useDistinctTypes } from '@/hooks/useOrders';
import { PaymentStatusFilter } from '@/types/order';
import { useResponsivePageSize } from '@/hooks/use-mobile';
import { getCurrentCycleYear, getCycleRange, getAvailableCycles, isCycleArchived } from '@/utils/cycle';


const Index = () => {
  const [selectedCycleYear, setSelectedCycleYear] = useState(() => getCurrentCycleYear());
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const isReadOnly = useMemo(() => isCycleArchived(selectedCycleYear), [selectedCycleYear]);

  // Performance Optimization: Moving filter/pagination state to Index
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [displaySearch, setDisplaySearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const pageSize = useResponsivePageSize();


  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(displaySearch);
      setPage(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [displaySearch]);

  const monthName = useMemo(() => {
    return new Date(currentMonth + '-01').toLocaleDateString('en-US', { month: 'long' });
  }, [currentMonth]);

  const {
    data: ordersData = { data: [], count: 0 },
    isLoading,
    refetch,
    isFetching
  } = useOrders({
    monthName,
    cycleYear: selectedCycleYear,
    searchQuery,
    paymentFilter,
    typeFilter
  }, page, pageSize || 50);


  const { data: stats } = useOrderStats(monthName, selectedCycleYear);
  const { data: distinctTypes = [] } = useDistinctTypes(selectedCycleYear);

  const months = useMemo(() => {
    return getCycleRange(selectedCycleYear);
  }, [selectedCycleYear]);

  const availableCycles = useMemo(() => getAvailableCycles(), []);

  const handleMonthChange = (val: string) => {
    setCurrentMonth(val);
    setPage(0); // Reset pagination on month change
  };

  const handleCycleChange = (val: string) => {
    const year = parseInt(val);
    setSelectedCycleYear(year);

    // When switching cycle, pick a reasonable default month (e.g. November of the new cycle)
    const newCycleMonths = getCycleRange(year);
    setCurrentMonth(newCycleMonths[0].val);
    setPage(0);
  };

  return (
    <div className="min-h-screen bg-background selection:bg-primary/20">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 w-full md:w-auto">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-lg shadow-primary/20 animate-float overflow-hidden relative">
                <img src="/logo.svg" alt="A1 Sivakasi Crackers Logo" className="h-full w-full object-cover" />
                <Sparkles className="h-6 w-6 text-white absolute opacity-20" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-gradient">A1 Sivakasi Crackers</h1>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Premium Order Management</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 w-full md:w-auto">
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 to-blue-600/20 rounded-lg blur opacity-0 group-hover:opacity-100 transition duration-500" />
                <select
                  value={selectedCycleYear}
                  onChange={(e) => handleCycleChange(e.target.value)}
                  className="relative bg-background border-none ring-1 ring-border rounded-lg px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-primary outline-none transition-all shadow-sm"
                >
                  {availableCycles.map(c => (
                    <option key={c.startYear} value={c.startYear}>
                      {c.label} {c.isArchived ? '(Archived)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 to-blue-600/20 rounded-lg blur opacity-0 group-hover:opacity-100 transition duration-500" />
                <select
                  value={currentMonth}
                  onChange={(e) => handleMonthChange(e.target.value)}
                  className="relative bg-background border-none ring-1 ring-border rounded-lg px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-primary outline-none transition-all shadow-sm"
                >
                  {months.map(m => (
                    <option key={m.val} value={m.val}>{m.label}</option>
                  ))}
                </select>
              </div>

              {!isReadOnly && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="btn-premium shadow-md shadow-primary/20" size="sm">
                      Add Record
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col premium-card border-none">
                    <DialogHeader className="flex-shrink-0">
                      <DialogTitle className="text-2xl font-black text-gradient">Add New Record</DialogTitle>
                      <DialogDescription>
                        Enter the details for the new order below for {monthName}.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto -mx-6 px-6">
                      <OrderForm currentMonth={monthName} />
                    </div>
                  </DialogContent>
                </Dialog>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="bg-background/50 hover:bg-primary/5 border-none ring-1 ring-border"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
                {isFetching ? 'Refreshing...' : 'Refresh'}
              </Button>
              <SettingsDialog />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Stats */}
        <DashboardStats stats={stats} />

        {/* Orders Table */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black tracking-tight border-l-4 border-primary pl-3">Order Registry</h2>
            <span className="text-[10px] font-bold bg-muted px-2 py-0.5 rounded-full text-muted-foreground uppercase">{(ordersData?.count || 0)} Total</span>

          </div>
          <OrdersTable
            orders={ordersData?.data || []}
            isLoading={isLoading}
            page={page}
            onPageChange={setPage}
            pageSize={pageSize || 50}
            totalCount={ordersData?.count || 0}


            searchQuery={displaySearch}
            onSearchChange={setDisplaySearch}
            isFetching={isFetching}
            paymentFilter={paymentFilter}
            onPaymentFilterChange={(f) => { setPaymentFilter(f); setPage(0); }}
            typeFilter={typeFilter}
            onTypeFilterChange={(t) => { setTypeFilter(t); setPage(0); }}
            availableTypes={distinctTypes}
            monthName={monthName}
            isReadOnly={isReadOnly}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-card/50 backdrop-blur-sm mt-20">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center overflow-hidden relative">
              <img src="/logo.svg" alt="Logo" className="h-full w-full object-cover" />
              <Sparkles className="h-4 w-4 text-muted-foreground absolute opacity-20" />
            </div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest text-center">
              A1 Sivakasi Crackers Dashboard • Built for Precision
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
