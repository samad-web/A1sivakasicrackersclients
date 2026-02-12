import { Order } from '@/types/order';
import { Package, IndianRupee, CheckCircle, Clock, FileText } from 'lucide-react';

interface DashboardStatsProps {
  stats?: {
    totalOrders: number;
    totalRevenue: number;
    paidOrders: number;
    invoicedOrders: number;
  };
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
}

function StatCard({ title, value, icon, description }: StatCardProps) {
  return (
    <div className="premium-card p-5 group hover:scale-[1.02] transition-all duration-300 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-12 -mt-12 group-hover:bg-primary/10 transition-colors duration-500" />
      <div className="flex items-start justify-between relative z-10">
        <div className="space-y-1">
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground/80">{title}</p>
          <p className="text-3xl font-black text-gradient leading-tight">{value}</p>
          {description && (
            <p className="text-[10px] font-bold text-primary/60 bg-primary/5 inline-block px-2 py-0.5 rounded-full mt-2 animate-fade-in">
              {description}
            </p>
          )}
        </div>
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center border border-white/20 shadow-sm animate-float">
          {icon}
        </div>
      </div>
    </div>
  );
}

export function DashboardStats({ stats }: DashboardStatsProps) {
  const formatCurrency = (amount: number) => {
    if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(1)}L`;
    }
    if (amount >= 1000) {
      return `₹${(amount / 1000).toFixed(1)}K`;
    }
    return `₹${amount}`;
  };

  if (!stats) {
    return (
      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="premium-card p-5 h-32 animate-pulse bg-muted/50" />
        ))}
      </div>
    );
  }

  const { totalOrders, totalRevenue, paidOrders, invoicedOrders } = stats;

  return (
    <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Total Orders"
        value={totalOrders}
        icon={<Package className="h-6 w-6 text-primary" />}
      />
      <StatCard
        title="Total Revenue"
        value={formatCurrency(totalRevenue)}
        icon={<IndianRupee className="h-6 w-6 text-primary" />}
      />
      <StatCard
        title="Paid Orders"
        value={paidOrders}
        icon={<CheckCircle className="h-6 w-6 text-success" />}
        description={`${((paidOrders / totalOrders) * 100 || 0).toFixed(0)}% overall`}
      />
      <StatCard
        title="Invoiced"
        value={invoicedOrders}
        icon={<FileText className="h-6 w-6 text-info" />}
        description={`${((invoicedOrders / totalOrders) * 100 || 0).toFixed(0)}% ready`}
      />
    </div>
  );
}
