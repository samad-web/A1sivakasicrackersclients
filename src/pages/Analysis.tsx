import { useState, useMemo, useRef } from 'react';
import {
  Sparkles,
  RefreshCw,
  LogOut,
  TrendingUp,
  Target,
  IndianRupee,
  Percent,
  PieChart,
  BarChart2,
  MapPin,
  Layers,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppNav } from '@/components/dashboard/AppNav';
import { SettingsDialog } from '@/components/dashboard/SettingsDialog';
import { useAuth } from '@/contexts/AuthProvider';
import { useAnalytics } from '@/hooks/useAnalytics';
import { getCurrentCycleYear, getAvailableCycles } from '@/utils/cycle';

import { AnalyticsStatCard } from '@/components/analysis/AnalyticsStatCard';
import { TierDonutChart } from '@/components/analysis/TierDonutChart';
import { DistrictBarChart } from '@/components/analysis/DistrictBarChart';
import { CollectionProgressCard } from '@/components/analysis/CollectionProgressCard';
import { SchemeBreakdown } from '@/components/analysis/SchemeBreakdown';
import { ScoreDistributionChart } from '@/components/analysis/ScoreDistributionChart';
import { LeadsTable } from '@/components/analysis/LeadsTable';
import { formatInr as inr } from '@/lib/utils';
import { isNumericScheme } from '@/hooks/useAnalytics';

const schemeLabel = (s: string) => (isNumericScheme(s) ? `₹${s}` : s);

const INSIGHT_COLORS: Record<string, { bg: string; text: string }> = {
  emerald: { bg: 'bg-emerald-500/20', text: 'text-emerald-300' },
  sky: { bg: 'bg-sky-500/20', text: 'text-sky-300' },
  amber: { bg: 'bg-amber-500/20', text: 'text-amber-300' },
  violet: { bg: 'bg-violet-500/20', text: 'text-violet-300' },
  rose: { bg: 'bg-rose-500/20', text: 'text-rose-300' },
};

function InsightRow({
  color,
  badge,
  icon,
  children,
}: {
  color: keyof typeof INSIGHT_COLORS;
  badge?: string | number;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const c = INSIGHT_COLORS[color];
  return (
    <div className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg text-[11px] font-black ${c.bg} ${c.text}`}
      >
        {icon ?? badge}
      </span>
      <p className="text-[13px] leading-snug text-white/80">{children}</p>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-card border border-border/60 p-5 shadow-sm transition-shadow duration-300 hover:shadow-lg">
      <div className="mb-4 flex items-center gap-3">
        {icon && (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
        )}
        <div>
          <h3 className="text-sm font-extrabold tracking-tight text-foreground">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

type TierFilter = 'all' | 'High' | 'Medium' | 'Low';

const Analysis = () => {
  const [selectedCycleYear, setSelectedCycleYear] = useState(() => getCurrentCycleYear());
  const { signOut } = useAuth();
  const availableCycles = useMemo(() => getAvailableCycles(), []);

  const { data, isLoading, isFetching, refetch } = useAnalytics(selectedCycleYear);

  // Cross-filter state shared by every chart + the leads table.
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [districtFilter, setDistrictFilter] = useState('');
  const [schemeFilter, setSchemeFilter] = useState('');
  const [scoreRange, setScoreRange] =
    useState<{ min: number; max: number; label: string } | null>(null);
  const leadsRef = useRef<HTMLDivElement>(null);

  const scrollToLeads = () =>
    leadsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Each drill-down clears the OTHER drill-downs so results are never a
  // confusing empty intersection, then jumps to the leads list.
  const pickTier = (t: TierFilter) => {
    setTierFilter((cur) => (cur === t ? 'all' : t));
    setDistrictFilter('');
    setSchemeFilter('');
    setScoreRange(null);
    scrollToLeads();
  };
  const pickDistrict = (d: string) => {
    setDistrictFilter((cur) => (cur === d ? '' : d));
    setSchemeFilter('');
    setTierFilter('all');
    setScoreRange(null);
    scrollToLeads();
  };
  const pickScheme = (s: string) => {
    setSchemeFilter((cur) => (cur === s ? '' : s));
    setDistrictFilter('');
    setTierFilter('all');
    setScoreRange(null);
    scrollToLeads();
  };
  const pickScoreRange = (min: number, max: number) => {
    const label = `${min}-${max}`;
    setScoreRange((cur) => (cur && cur.label === label ? null : { min, max, label }));
    setTierFilter('all');
    setDistrictFilter('');
    setSchemeFilter('');
    scrollToLeads();
  };
  const clearAll = () => {
    setTierFilter('all');
    setDistrictFilter('');
    setSchemeFilter('');
    setScoreRange(null);
  };
  const anyFilter =
    tierFilter !== 'all' || !!districtFilter || !!schemeFilter || !!scoreRange;

  const high = data?.tiers.find((t) => t.tier === 'High')?.count ?? 0;
  const medium = data?.tiers.find((t) => t.tier === 'Medium')?.count ?? 0;
  const low = data?.tiers.find((t) => t.tier === 'Low')?.count ?? 0;

  // Auto-generated insights for the Quick Read panel — the "so what" of the data.
  const insights = useMemo(() => {
    if (!data) return null;
    // Only consider named/numeric schemes with a representative cohort for
    // superlatives, so we never say "₹Unspecified is the most reliable".
    const namedSchemes = data.schemes.filter(
      (s) => s.count >= 3 && isNumericScheme(s.scheme)
    );
    const districts = data.districts.filter(
      (d) => d.count >= 3 && d.district !== 'Unspecified'
    );
    const popular = [...data.schemes]
      .filter((s) => isNumericScheme(s.scheme))
      .sort((a, b) => b.count - a.count)[0];
    // Best/weak superlatives only make sense with 2+ comparable schemes.
    const ranked = [...namedSchemes].sort((a, b) => b.avgScore - a.avgScore);
    const bestScheme = ranked.length >= 2 ? ranked[0] : undefined;
    const weakScheme =
      ranked.length >= 2 ? ranked[ranked.length - 1] : undefined;
    const bestDistrict = [...districts].sort((a, b) => b.avgScore - a.avgScore)[0];
    const atRiskValue = data.leads
      .filter((l) => l.tier === 'Low')
      .reduce((s, l) => s + (Number(l.value) || 0), 0);
    const highPct = Math.round((high / (data.totalCustomers || 1)) * 100);
    return { popular, bestScheme, weakScheme, bestDistrict, atRiskValue, highPct };
  }, [data, high]);

  return (
    <div className="min-h-screen bg-background selection:bg-primary/20">
      {/* Header — mirrors the Dashboard header */}
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
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Rejoin Analysis &amp; Insights
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 w-full md:w-auto">
              <AppNav />
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 to-blue-600/20 rounded-lg blur opacity-0 group-hover:opacity-100 transition duration-500" />
                <select
                  value={selectedCycleYear}
                  onChange={(e) => setSelectedCycleYear(parseInt(e.target.value))}
                  className="relative bg-background border-none ring-1 ring-border rounded-lg px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-primary outline-none transition-all shadow-sm"
                >
                  {availableCycles.map((c) => (
                    <option key={c.startYear} value={c.startYear}>
                      {c.label} {c.isArchived ? '(Archived)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="bg-background/50 hover:bg-primary/5 border-none ring-1 ring-border"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
                {isFetching ? 'Syncing...' : 'Refresh'}
              </Button>
              <SettingsDialog />
              <Button
                variant="outline"
                size="sm"
                onClick={() => signOut()}
                className="bg-background/50 hover:bg-destructive/5 border-none ring-1 ring-border"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        {/* Hero / methodology */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-blue-600 to-indigo-700 p-6 text-white shadow-lg shadow-primary/20">
          <div className="absolute -top-16 -right-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-black/10 blur-2xl" />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-5 w-5" />
                <h2 className="text-xl font-extrabold tracking-tight">Rejoin Likelihood Engine</h2>
              </div>
              <p className="text-sm text-white/85 max-w-2xl leading-relaxed">
                Every customer scored 0–100 on payment reliability — completions, on-time streak &amp;
                consistency. Click any card, district, or scheme to drill your priority list. Syncs live.
              </p>
            </div>
            {data && data.totalCustomers > 0 && (
              <div className="flex gap-6 sm:gap-8 flex-shrink-0">
                <div>
                  <p className="text-3xl font-extrabold tabular-nums">{data.totalCustomers}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Customers</p>
                </div>
                <div>
                  <p className="text-3xl font-extrabold tabular-nums">{data.avgScore}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Avg Score</p>
                </div>
                <div>
                  <p className="text-3xl font-extrabold tabular-nums">{data.collectionRate}%</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Collected</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Active filter banner — makes card / district / scheme clicks visibly take effect */}
        {anyFilter && (
          <div className="flex items-center gap-3 rounded-xl bg-primary/10 ring-1 ring-primary/20 px-4 py-3 text-sm flex-wrap">
            <span className="font-bold text-primary">Filtered:</span>
            {tierFilter !== 'all' && (
              <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">
                {tierFilter} tier
              </span>
            )}
            {districtFilter && (
              <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">
                {districtFilter}
              </span>
            )}
            {schemeFilter && (
              <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">
                {schemeLabel(schemeFilter)} scheme
              </span>
            )}
            {scoreRange && (
              <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">
                score {scoreRange.label}
              </span>
            )}
            <button onClick={clearAll} className="ml-auto text-primary font-bold hover:underline">
              Clear
            </button>
            <button onClick={scrollToLeads} className="text-primary font-bold hover:underline">
              View leads ↓
            </button>
          </div>
        )}

        {/* Empty-cycle state */}
        {data && data.totalCustomers === 0 && (
          <div className="rounded-2xl bg-card border border-border/60 p-12 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <PieChart className="h-7 w-7" />
            </div>
            <h3 className="text-lg font-extrabold text-foreground">No customers in this cycle yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick a different cycle from the selector above, or add records in the Dashboard to see
              the analysis here.
            </p>
          </div>
        )}

        {/* KPI cards */}
        {isLoading || !data ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-2xl h-32 animate-pulse bg-muted/50" />
            ))}
          </div>
        ) : data.totalCustomers === 0 ? null : (
          <div
            className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 transition-opacity duration-200 ${
              isFetching ? 'opacity-60' : 'opacity-100'
            }`}
          >
            <AnalyticsStatCard
              title="High Likelihood"
              value={high}
              description={`${Math.round((high / (data.totalCustomers || 1)) * 100)}% · call first`}
              icon={<Target className="h-5 w-5" />}
              tone="success"
              onClick={() => pickTier('High')}
              active={tierFilter === 'High'}
              info="Customers most likely to rejoin next cycle (rejoin score 55+). Your most reliable payers — contact these first for re-enrolment. Click to see the list."
            />
            <AnalyticsStatCard
              title="Medium"
              value={medium}
              description={`${Math.round((medium / (data.totalCustomers || 1)) * 100)}% · nurture`}
              icon={<Clock className="h-5 w-5" />}
              tone="warning"
              onClick={() => pickTier('Medium')}
              active={tierFilter === 'Medium'}
              info="On-the-fence customers (score 30–54). A reminder call or small offer often converts them. Click to see the list."
            />
            <AnalyticsStatCard
              title="Low / At-risk"
              value={low}
              description={`${Math.round((low / (data.totalCustomers || 1)) * 100)}% · win-back`}
              icon={<AlertTriangle className="h-5 w-5" />}
              tone="danger"
              onClick={() => pickTier('Low')}
              active={tierFilter === 'Low'}
              info="Customers who paid inconsistently (score under 30). Unlikely to rejoin without a personal follow-up. Click to see the list."
            />
            <AnalyticsStatCard
              title="High-tier Value"
              value={inr(data.highValue)}
              description="revenue to protect"
              icon={<IndianRupee className="h-5 w-5" />}
              tone="success"
              info="Total scheme value (₹) of all High-likelihood customers combined. This is the next-cycle revenue at stake if you don't re-enrol your best customers."
            />
            <AnalyticsStatCard
              title="Collection Rate"
              value={`${data.collectionRate}%`}
              description="installments paid"
              icon={<Percent className="h-5 w-5" />}
              tone="primary"
              info="Of all the monthly installments due so far this cycle, the share that have been paid. A whole-cycle health metric — higher is better."
            />
          </div>
        )}

        {/* Charts grid */}
        {isLoading || !data ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl bg-card border border-border/60 h-80 animate-pulse"
              />
            ))}
          </div>
        ) : data.totalCustomers === 0 ? null : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard
              title="Rejoin Tiers"
              subtitle="Click a segment to see those customers"
              icon={<PieChart className="h-4 w-4" />}
            >
              <TierDonutChart
                data={data.tiers}
                onTierClick={(t) => pickTier(t as TierFilter)}
                activeTier={tierFilter === 'all' ? undefined : tierFilter}
                onClear={() => setTierFilter('all')}
              />
            </ChartCard>
            <ChartCard
              title="Score Distribution"
              subtitle="Click a bar to filter by score range"
              icon={<BarChart2 className="h-4 w-4" />}
            >
              <ScoreDistributionChart
                scores={data.leads.filter((l) => l.tier !== 'Unscored').map((l) => l.score)}
                onBucketClick={pickScoreRange}
                activeBucket={scoreRange?.label}
                onClear={() => setScoreRange(null)}
              />
            </ChartCard>
            <CollectionProgressCard data={data.monthly} />
            <ChartCard
              title="Top Districts"
              subtitle="Average rejoin score by district"
              icon={<MapPin className="h-4 w-4" />}
            >
              <DistrictBarChart
                data={data.districts}
                onBarClick={pickDistrict}
                activeDistrict={districtFilter}
                onClear={() => setDistrictFilter('')}
              />
            </ChartCard>
            <SchemeBreakdown
              data={data.schemes}
              activeScheme={schemeFilter}
              onSchemeClick={pickScheme}
            />
            <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-900 p-5 text-white shadow-sm flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-300" />
                <h3 className="text-sm font-extrabold tracking-tight">Quick Read</h3>
                <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-white/40">
                  auto insights
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
                <InsightRow color="emerald" badge={`${insights?.highPct ?? 0}%`}>
                  <b className="text-white">{high} customers</b> are high-likelihood — your
                  first-call priority for re-enrolment.
                </InsightRow>
                <InsightRow color="sky" badge={Math.round(data.collectionRate)}>
                  Collection rate is <b className="text-white">{data.collectionRate}%</b> of
                  installments due so far.
                </InsightRow>
                <InsightRow color="amber" icon={<IndianRupee className="h-3.5 w-3.5" />}>
                  Total book value this cycle:{' '}
                  <b className="text-white">{inr(data.totalValue)}</b>.
                </InsightRow>
                {insights?.popular && (
                  <InsightRow color="violet" icon={<Layers className="h-3.5 w-3.5" />}>
                    <b className="text-white">{schemeLabel(insights.popular.scheme)}</b> is the most
                    popular scheme ({insights.popular.count} customers).
                  </InsightRow>
                )}
                {insights?.bestScheme && (
                  <InsightRow color="emerald" icon={<TrendingUp className="h-3.5 w-3.5" />}>
                    <b className="text-white">{schemeLabel(insights.bestScheme.scheme)}</b> has the
                    most reliable customers (avg score {insights.bestScheme.avgScore}).
                  </InsightRow>
                )}
                {insights?.bestDistrict && (
                  <InsightRow color="sky" icon={<MapPin className="h-3.5 w-3.5" />}>
                    <b className="text-white">{insights.bestDistrict.district}</b> is your
                    strongest district (avg score {insights.bestDistrict.avgScore}).
                  </InsightRow>
                )}
                {insights?.weakScheme &&
                  insights.weakScheme.scheme !== insights.bestScheme?.scheme && (
                    <InsightRow color="rose" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
                      <b className="text-white">{schemeLabel(insights.weakScheme.scheme)}</b> needs
                      attention (lowest avg score {insights.weakScheme.avgScore}).
                    </InsightRow>
                  )}
                {(insights?.atRiskValue ?? 0) > 0 ? (
                  <InsightRow color="rose" icon={<IndianRupee className="h-3.5 w-3.5" />}>
                    <b className="text-white">{inr(insights?.atRiskValue ?? 0)}</b> of value sits
                    with at-risk customers — worth a win-back push.
                  </InsightRow>
                ) : (
                  <InsightRow color="emerald" icon={<TrendingUp className="h-3.5 w-3.5" />}>
                    No at-risk value this cycle — collections are healthy.
                  </InsightRow>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Leads table */}
        <div
          className={`space-y-4 scroll-mt-24 ${
            data && data.totalCustomers === 0 ? 'hidden' : ''
          }`}
          ref={leadsRef}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-black tracking-tight border-l-4 border-primary pl-3">
              Priority Leads
            </h2>
            {data && (
              <span className="text-[10px] font-bold bg-muted px-2 py-0.5 rounded-full text-muted-foreground uppercase">
                {data.leads.length} Ranked
              </span>
            )}
            {anyFilter && (
              <button
                onClick={clearAll}
                className="text-[11px] font-bold text-primary hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
          {isLoading || !data ? (
            <div className="rounded-2xl bg-card border border-border/60 h-96 animate-pulse" />
          ) : (
            <LeadsTable
              leads={data.leads}
              tierFilter={tierFilter}
              onTierFilterChange={setTierFilter}
              districtFilter={districtFilter}
              onDistrictFilterChange={setDistrictFilter}
              schemeFilter={schemeFilter}
              onSchemeFilterChange={setSchemeFilter}
              scoreRange={scoreRange}
              onScoreRangeChange={setScoreRange}
            />
          )}
        </div>
      </main>

      <footer className="border-t bg-card/50 backdrop-blur-sm mt-20">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center overflow-hidden relative">
              <img src="/logo.svg" alt="Logo" className="h-full w-full object-cover" />
              <Sparkles className="h-4 w-4 text-muted-foreground absolute opacity-20" />
            </div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest text-center">
              A1 Sivakasi Crackers • Rejoin Analytics
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Analysis;
