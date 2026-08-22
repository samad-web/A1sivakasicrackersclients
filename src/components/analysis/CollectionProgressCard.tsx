import { useEffect, useMemo, useState } from 'react';
import { LineChart } from 'lucide-react';
import { MonthlyTrendChart } from './MonthlyTrendChart';
import type { MonthTrend } from '@/hooks/useAnalytics';

interface CollectionProgressCardProps {
  data: MonthTrend[];
}

/**
 * Collection Progress with a Year quick-filter + From→To month range.
 *
 * A scheme cycle spans two calendar years (Nov–Dec of cycleYear, then Jan–Sep of
 * cycleYear+1), so month names alone are ambiguous. The Year buttons let the
 * client jump to "all of 2025" or "all of 2026" in one click, and the From/To
 * dropdowns are year-labelled ("Dec '25", "Jan '26") so the selection is always
 * unambiguous. Everything auto-syncs: picking a Year snaps From/To to that year's
 * span, and cumulative % is recomputed for the visible window.
 */
export function CollectionProgressCard({ data }: CollectionProgressCardProps) {
  const lastIdx = Math.max(0, data.length - 1);
  const [fromIdx, setFromIdx] = useState(0);
  const [toIdx, setToIdx] = useState(lastIdx);
  const [yearFilter, setYearFilter] = useState<'all' | number>('all');

  // Distinct calendar years present in this cycle, in order (e.g. [2025, 2026]).
  const years = useMemo(() => {
    const seen: number[] = [];
    for (const d of data) if (!seen.includes(d.year)) seen.push(d.year);
    return seen;
  }, [data]);

  // When the cycle (and therefore data length) changes, reset the range so we
  // never point at a stale index.
  useEffect(() => {
    setFromIdx(0);
    setToIdx(Math.max(0, data.length - 1));
    setYearFilter('all');
  }, [data.length]);

  // Guard against stale indices.
  const lo = Math.min(fromIdx, lastIdx);
  const hi = Math.min(Math.max(toIdx, lo), lastIdx);

  // Picking a year snaps the From/To range to that year's month span and drives
  // the dropdowns too (auto-sync). "All" restores the full cycle.
  const applyYear = (y: 'all' | number) => {
    setYearFilter(y);
    if (y === 'all') {
      setFromIdx(0);
      setToIdx(lastIdx);
      return;
    }
    const idxs = data.map((d, i) => (d.year === y ? i : -1)).filter((i) => i >= 0);
    if (idxs.length) {
      setFromIdx(idxs[0]);
      setToIdx(idxs[idxs.length - 1]);
    }
  };

  // If the user hand-edits the dropdowns away from a clean year span, drop the
  // active Year highlight so the UI never lies about what's selected.
  const syncYearHighlight = (nextLo: number, nextHi: number) => {
    const spanYears = new Set(data.slice(nextLo, nextHi + 1).map((d) => d.year));
    if (spanYears.size === 1) {
      const only = [...spanYears][0];
      const full = data.map((d, i) => (d.year === only ? i : -1)).filter((i) => i >= 0);
      setYearFilter(full[0] === nextLo && full[full.length - 1] === nextHi ? only : 'all');
    } else {
      setYearFilter('all');
    }
  };

  const view = useMemo(() => {
    const slice = data.slice(lo, hi + 1);
    // Recompute cumulative % against the total scheduled *within the window* so
    // the curve reads honestly for the selected range.
    const windowTotalExpected = slice.reduce((s, d) => s + d.expected, 0);
    const windowTotalCompleted = slice.reduce((s, d) => s + d.collected, 0);
    const denom = windowTotalExpected || windowTotalCompleted || 1;
    let running = 0;
    return slice.map((d) => {
      running += d.collected;
      return { ...d, cumulativePct: Math.round((running / denom) * 1000) / 10 };
    });
  }, [data, lo, hi]);

  const isFiltered = lo !== 0 || hi !== lastIdx;
  const singleMonth = hi === lo;

  if (data.length === 0) {
    return (
      <div className="rounded-2xl bg-card border border-border/60 p-5 shadow-sm">
        <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
          No collection data for this cycle yet.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-card border border-border/60 p-5 shadow-sm transition-shadow duration-300 hover:shadow-lg">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <LineChart className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold tracking-tight text-foreground">
            Collection Progress
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Monthly completions (bars) &amp; cumulative % collected (line)
          </p>
        </div>
      </div>

      {/* Controls: Year quick-filter + year-aware month range. Own rows on mobile. */}
      <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        {/* Year quick-filter */}
        {years.length > 1 && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground font-semibold mr-0.5">Year</span>
            <button
              onClick={() => applyYear('all')}
              className={`rounded-lg px-2.5 py-1 font-bold transition-colors ${
                yearFilter === 'all'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70'
              }`}
            >
              All
            </button>
            {years.map((y) => (
              <button
                key={y}
                onClick={() => applyYear(y)}
                className={`rounded-lg px-2.5 py-1 font-bold transition-colors ${
                  yearFilter === y
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/70'
                }`}
              >
                {y}
              </button>
            ))}
          </div>
        )}

        {/* Month range — year-labelled dropdowns */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground font-semibold">From</span>
          <select
            aria-label="From month"
            value={lo}
            onChange={(e) => {
              const v = Number(e.target.value);
              const nextHi = v > hi ? v : hi;
              setFromIdx(v);
              if (v > hi) setToIdx(v);
              syncYearHighlight(v, nextHi);
            }}
            className="bg-background ring-1 ring-border rounded-lg px-2 py-1 font-semibold outline-none focus:ring-2 focus:ring-primary"
          >
            {data.map((d, i) => (
              <option key={d.month} value={i}>
                {d.labelWithYear}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground font-semibold">to</span>
          <select
            aria-label="To month"
            value={hi}
            onChange={(e) => {
              const v = Number(e.target.value);
              const nextLo = v < lo ? v : lo;
              setToIdx(v);
              if (v < lo) setFromIdx(v);
              syncYearHighlight(nextLo, v);
            }}
            className="bg-background ring-1 ring-border rounded-lg px-2 py-1 font-semibold outline-none focus:ring-2 focus:ring-primary"
          >
            {data.map((d, i) => (
              <option key={d.month} value={i}>
                {d.labelWithYear}
              </option>
            ))}
          </select>
          {isFiltered && (
            <button
              onClick={() => applyYear('all')}
              className="ml-1 text-primary font-bold hover:underline flex-shrink-0"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {singleMonth ? (
        <div className="flex h-[280px] flex-col items-center justify-center gap-1 text-center">
          <span className="text-3xl font-black tabular-nums text-primary">
            {view[0]?.collected ?? 0}
          </span>
          <span className="text-sm font-semibold text-foreground">
            completed in {view[0]?.labelWithYear}
          </span>
          <span className="text-xs text-muted-foreground">
            Widen the range to see the collection trend.
          </span>
        </div>
      ) : (
        <MonthlyTrendChart data={view} />
      )}
    </div>
  );
}

export default CollectionProgressCard;
