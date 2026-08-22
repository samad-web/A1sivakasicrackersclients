import type { SchemeStat } from '@/hooks/useAnalytics';
import { isNumericScheme } from '@/hooks/useAnalytics';
import { formatInr as inr } from '@/lib/utils';

/** Display label for a scheme: "₹500" for amounts, "Unspecified" otherwise. */
const schemeLabel = (s: string) => (isNumericScheme(s) ? `₹${s}` : s);

interface SchemeBreakdownProps {
  data: SchemeStat[];
  activeScheme?: string;
  onSchemeClick?: (scheme: string) => void;
}

/**
 * "Data reality by scheme" — one interactive row per scheme value showing how
 * many customers bought it, their tier split (High/Medium/Low as a stacked bar),
 * average rejoin score, real collection rate, and total book value.
 * Rows are clickable to drill the leads list down to that scheme.
 */
export function SchemeBreakdown({ data, activeScheme, onSchemeClick }: SchemeBreakdownProps) {
  // Show the schemes that actually have customers, largest cohort first.
  const rows = [...data].filter((s) => s.count > 0).sort((a, b) => b.count - a.count);
  const maxCount = Math.max(1, ...rows.map((s) => s.count));

  return (
    <div className="rounded-2xl bg-card border border-border/60 shadow-sm overflow-hidden transition-shadow duration-300 hover:shadow-lg">
      <div className="p-5 border-b border-border/60 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary text-sm font-black">
          ₹
        </div>
        <div>
          <h3 className="text-sm font-extrabold tracking-tight text-foreground">Reality by Scheme</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tier split, collection &amp; value per scheme — click a row to drill in
          </p>
        </div>
      </div>

      <div className="divide-y divide-border/60 max-h-[420px] overflow-y-auto">
        {rows.map((s) => {
          const total = s.high + s.medium + s.low || 1;
          const isActive = activeScheme && String(activeScheme) === String(s.scheme);
          return (
            <button
              key={s.scheme}
              onClick={() => onSchemeClick?.(String(s.scheme))}
              className={`w-full text-left px-5 py-3 transition-colors hover:bg-primary/[0.04] ${
                isActive ? 'bg-primary/[0.06] ring-1 ring-inset ring-primary/30' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className="text-base font-black tabular-nums"
                    title={
                      isNumericScheme(s.scheme)
                        ? `Scheme amount: customers who pay ₹${s.scheme} per month`
                        : 'Customers with no scheme amount recorded'
                    }
                  >
                    {schemeLabel(s.scheme)}
                  </span>
                  <span
                    className="text-[11px] font-bold text-muted-foreground"
                    title={`${s.count} customers in the ${schemeLabel(s.scheme)} scheme`}
                  >
                    {s.count} customers
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-bold">
                  <span
                    className="text-muted-foreground"
                    title="Average Rejoin Score (0–100) of customers in this scheme — how likely they are to rejoin next cycle"
                  >
                    score <span className="text-foreground tabular-nums">{s.avgScore}</span>
                  </span>
                  <span
                    className="text-muted-foreground"
                    title="Collection Rate — the share of due monthly installments this scheme's customers have paid"
                  >
                    coll <span className="text-foreground tabular-nums">{s.collectionRate}%</span>
                  </span>
                  <span
                    className="text-foreground tabular-nums"
                    title="Total book value — combined revenue from all customers in this scheme"
                  >
                    {inr(s.value)}
                  </span>
                </div>
              </div>

              {/* Cohort-size bar with tier split. */}
              <div
                className="h-2.5 rounded-full overflow-hidden bg-muted flex"
                style={{ width: `${Math.max(4, (s.count / maxCount) * 100)}%` }}
                title={`Tier split — High: ${s.high}, Medium: ${s.medium}, Low: ${s.low} customers`}
              >
                <span className="h-full bg-emerald-500" style={{ width: `${(s.high / total) * 100}%` }} />
                <span className="h-full bg-amber-500" style={{ width: `${(s.medium / total) * 100}%` }} />
                <span className="h-full bg-rose-500" style={{ width: `${(s.low / total) * 100}%` }} />
              </div>
            </button>
          );
        })}
        {rows.length === 0 && (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            No scheme data for this cycle.
          </div>
        )}
      </div>

      <div className="px-5 py-2.5 border-t border-border/60 flex items-center gap-4 text-[11px] font-semibold text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> High
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Medium
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Low
        </span>
      </div>
    </div>
  );
}

export default SchemeBreakdown;
