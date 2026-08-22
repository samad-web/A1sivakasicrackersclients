import { useMemo, useState } from 'react';
import { Search, Download, X } from 'lucide-react';
import type { LeadRow } from '@/hooks/useAnalytics';
import { isNumericScheme } from '@/hooks/useAnalytics';

const schemeLabel = (s: string) => (isNumericScheme(s) ? `₹${s}` : s);

type TierFilter = 'all' | 'High' | 'Medium' | 'Low';

const MONTH_LABELS = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];

interface LeadsTableProps {
  leads: LeadRow[];
  /** Controlled tier filter (from the KPI cards). Falls back to internal state when omitted. */
  tierFilter?: TierFilter;
  onTierFilterChange?: (t: TierFilter) => void;
  /** Controlled district filter (from the district chart). '' = all districts. */
  districtFilter?: string;
  onDistrictFilterChange?: (d: string) => void;
  /** Controlled scheme filter (from the scheme breakdown). '' = all schemes. */
  schemeFilter?: string;
  onSchemeFilterChange?: (s: string) => void;
  /** Controlled score-range filter (from the distribution chart). null = all. */
  scoreRange?: { min: number; max: number; label: string } | null;
  onScoreRangeChange?: (r: { min: number; max: number; label: string } | null) => void;
}

const TIER_STYLE: Record<string, { text: string; bg: string; bar: string }> = {
  High: { text: 'text-emerald-600', bg: 'bg-emerald-500/12', bar: 'bg-emerald-500' },
  Medium: { text: 'text-amber-600', bg: 'bg-amber-500/15', bar: 'bg-amber-500' },
  Low: { text: 'text-rose-600', bg: 'bg-rose-500/12', bar: 'bg-rose-500' },
  Unscored: { text: 'text-muted-foreground', bg: 'bg-muted', bar: 'bg-muted-foreground/40' },
};

type SortKey = 'score' | 'name' | 'district' | 'value' | 'paid';

/**
 * The auto-synced priority leads list for the Analysis page: searchable,
 * tier-filterable, sortable, with a per-customer payment pattern and CSV export.
 * Purely presentational — it renders whatever the live useAnalytics data supplies.
 */
export function LeadsTable({
  leads,
  tierFilter,
  onTierFilterChange,
  districtFilter,
  onDistrictFilterChange,
  schemeFilter,
  onSchemeFilterChange,
  scoreRange,
  onScoreRangeChange,
}: LeadsTableProps) {
  const [q, setQ] = useState('');
  const [internalTier, setInternalTier] = useState<TierFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<-1 | 1>(-1);

  // Tier + district are controlled when the page passes handlers, else local.
  const tier = tierFilter ?? internalTier;
  const setTier = (t: TierFilter) =>
    onTierFilterChange ? onTierFilterChange(t) : setInternalTier(t);
  const district = districtFilter ?? '';
  const scheme = schemeFilter ?? '';

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const districtKey = district.trim().toLowerCase();
    const rows = leads.filter((l) => {
      const matchTier = tier === 'all' || l.tier === tier;
      const matchDistrict =
        !districtKey || String(l.district || '').trim().toLowerCase() === districtKey;
      const matchScheme = !scheme || String(l.scheme) === String(scheme);
      const matchScore =
        !scoreRange ||
        (l.score >= scoreRange.min &&
          (scoreRange.max >= 100 ? l.score <= 100 : l.score < scoreRange.max));
      const matchQ =
        !query ||
        [l.name, l.number, l.district].some((f) =>
          String(f || '').toLowerCase().includes(query)
        );
      return matchTier && matchDistrict && matchScheme && matchScore && matchQ;
    });
    rows.sort((a, b) => {
      const av = a[sortKey] as string | number;
      const bv = b[sortKey] as string | number;
      if (typeof av === 'string') {
        return sortDir * av.localeCompare(bv as string);
      }
      return sortDir * ((av as number) - (bv as number));
    });
    return rows;
  }, [leads, q, tier, district, scheme, scoreRange, sortKey, sortDir]);

  const setSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === -1 ? 1 : -1));
    else {
      setSortKey(k);
      setSortDir(k === 'name' || k === 'district' ? 1 : -1);
    }
  };

  const exportCsv = () => {
    const header = [
      'Rank', 'Receipt', 'Name', 'Number', 'District', 'Type', 'Scheme',
      'Value', 'Paid', 'Term', 'Streak', 'Score', 'Tier',
    ];
    const lines = filtered.map((l, i) =>
      [
        i + 1, l.receipt_no, l.name, l.number, l.district, l.type, l.scheme,
        l.value, l.paid, l.term, l.streak, l.score, l.tier,
      ]
        .map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`)
        .join(',')
    );
    const blob = new Blob(['﻿' + [header.join(','), ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rejoin_priority_leads.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const tiers: Array<'all' | 'High' | 'Medium' | 'Low'> = ['all', 'High', 'Medium', 'Low'];

  return (
    <div className="rounded-2xl bg-card border border-border/60 shadow-sm overflow-hidden">
      {/* Controls */}
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between p-4 border-b border-border/60">
        <div className="relative w-full lg:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name / number / district…"
            className="w-full bg-background/50 ring-1 ring-border rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary transition-all"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {district && (
            <button
              onClick={() => onDistrictFilterChange?.('')}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20 hover:bg-primary/15 transition-all"
              title="Clear district filter"
            >
              {district}
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {scheme && (
            <button
              onClick={() => onSchemeFilterChange?.('')}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20 hover:bg-primary/15 transition-all"
              title="Clear scheme filter"
            >
              {schemeLabel(scheme)} scheme
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {scoreRange && (
            <button
              onClick={() => onScoreRangeChange?.(null)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20 hover:bg-primary/15 transition-all"
              title="Clear score filter"
            >
              score {scoreRange.label}
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <div className="inline-flex bg-background/60 ring-1 ring-border rounded-lg p-1">
            {tiers.map((t) => (
              <button
                key={t}
                onClick={() => setTier(t)}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all capitalize ${
                  tier === t
                    ? 'bg-gradient-to-r from-primary to-blue-600 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-background/60 ring-1 ring-border text-muted-foreground hover:text-foreground hover:bg-primary/5 transition-all"
          >
            <Download className="h-3.5 w-3.5" /> Export
          </button>
        </div>
      </div>

      {/* Count */}
      <div className="px-4 py-2 text-xs text-muted-foreground font-medium border-b border-border/60">
        Showing <span className="font-bold text-foreground">{filtered.length}</span> of{' '}
        {leads.length} customers · sorted by {sortKey}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-table-header/40 text-left">
              {([
                ['score', 'Score', 'Rejoin Score (0–100) — how likely this customer is to rejoin next cycle. Click to sort.'],
                ['name', 'Customer', 'Customer name & phone number. Click to sort A–Z.'],
                ['district', 'District', 'The customer\'s district. Click to sort A–Z.'],
                ['value', 'Value', 'Total scheme value (₹) of this customer\'s order. Click to sort.'],
                ['paid', 'Paid', 'Installments paid ÷ total term (e.g. 8/10). Click to sort.'],
              ] as [SortKey, string, string][]).map(([k, label, tip]) => (
                <th
                  key={k}
                  onClick={() => setSort(k)}
                  title={tip}
                  className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-muted-foreground cursor-pointer select-none whitespace-nowrap hover:text-foreground"
                >
                  {label}{' '}
                  <span className={sortKey === k ? 'text-primary' : 'text-muted-foreground/30'}>
                    {sortKey === k ? (sortDir < 0 ? '▾' : '▴') : '↕'}
                  </span>
                </th>
              ))}
              <th
                title="Payment pattern across the cycle (Nov→Sep). Green = paid that month, red = missed, dashed = not applicable for that scheme."
                className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-muted-foreground whitespace-nowrap cursor-help"
              >
                Pattern (Nov→Sep)
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-16">
                  <p className="text-muted-foreground font-medium">
                    No customers match this combination
                    {district && (
                      <>
                        {' '}in <span className="font-bold text-foreground">{district}</span>
                      </>
                    )}
                    {scheme && (
                      <>
                        {' '}for the <span className="font-bold text-foreground">{schemeLabel(scheme)}</span> scheme
                      </>
                    )}
                    {tier !== 'all' && (
                      <>
                        {' '}at <span className="font-bold text-foreground">{tier}</span> tier
                      </>
                    )}
                    .
                  </p>
                  <div className="mt-3 flex items-center justify-center gap-2">
                    {tier !== 'all' && (
                      <button
                        onClick={() => setTier('all')}
                        className="text-xs font-bold text-primary hover:underline"
                      >
                        Clear tier
                      </button>
                    )}
                    {district && (
                      <button
                        onClick={() => onDistrictFilterChange?.('')}
                        className="text-xs font-bold text-primary hover:underline"
                      >
                        Clear district
                      </button>
                    )}
                    {scheme && (
                      <button
                        onClick={() => onSchemeFilterChange?.('')}
                        className="text-xs font-bold text-primary hover:underline"
                      >
                        Clear scheme
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.slice(0, 400).map((l) => {
                const st = TIER_STYLE[l.tier] ?? TIER_STYLE.Unscored;
                return (
                  <tr
                    key={l.id}
                    className="border-b border-border/40 hover:bg-primary/[0.03] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${st.bg} ${st.text}`}
                        >
                          {l.tier === 'Unscored' ? '—' : l.tier}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full ${st.bar}`}
                              style={{ width: `${l.score}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-black tabular-nums">{l.score}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold">{l.name || '—'}</p>
                      <p className="text-xs text-muted-foreground">{l.number}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{l.district || '—'}</td>
                    <td className="px-4 py-3 font-bold tabular-nums">
                      ₹{Number(l.value).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {l.paid}/{l.term}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-[3px]">
                        {l.seq.map((x, i) => {
                          // 10-month schemes don't participate in Nov/Dec (slots 0-1).
                          const na = l.term === 10 && i < 2;
                          return (
                            <span
                              key={i}
                              title={`${MONTH_LABELS[i]}: ${
                                na ? 'n/a' : x ? 'Paid' : 'Not paid'
                              }`}
                              className={`w-2 h-4 rounded-[2px] ${
                                na
                                  ? 'bg-transparent border border-dashed border-border'
                                  : x
                                  ? 'bg-emerald-500'
                                  : 'bg-rose-200 dark:bg-rose-500/25'
                              }`}
                            />
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > 400 && (
        <div className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border/60">
          Showing top 400 rows — refine the search to narrow.
        </div>
      )}
    </div>
  );
}
