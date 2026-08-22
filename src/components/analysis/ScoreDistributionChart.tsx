import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AXIS_TICK, chartColor } from './chartTheme';
import { ChartTooltipShell } from './ChartTooltip';

export interface ScoreDistributionChartProps {
  scores: number[];
  height?: number;
  /** Click a bucket to filter the leads to that score range. */
  onBucketClick?: (min: number, max: number) => void;
  /** Active bucket label (e.g. '40-60') to highlight. */
  activeBucket?: string;
  /** Clicking the empty area clears the active score-range filter. */
  onClear?: () => void;
}

const BUCKETS: { label: string; min: number; max: number }[] = [
  { label: '0-20', min: 0, max: 20 },
  { label: '20-40', min: 20, max: 40 },
  { label: '40-60', min: 40, max: 60 },
  { label: '60-80', min: 60, max: 80 },
  { label: '80-100', min: 80, max: 100 },
];

interface DistTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: { label: string; count: number }; color?: string }>;
}

function DistTooltip({ active, payload }: DistTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  if (!d) return null;
  return (
    <ChartTooltipShell
      title={`Score ${d.label}`}
      rows={[{ label: 'Customers', value: d.count, color: payload[0].color }]}
    />
  );
}

export function ScoreDistributionChart({
  scores,
  height = 300,
  onBucketClick,
  activeBucket,
  onClear,
}: ScoreDistributionChartProps) {
  const data = useMemo(() => {
    const counts = BUCKETS.map((b) => ({ label: b.label, count: 0, min: b.min, max: b.max }));
    for (const raw of scores) {
      const s = Math.max(0, Math.min(100, raw));
      // Last bucket is inclusive of 100; others are [min, max).
      let idx = BUCKETS.findIndex((b) => s >= b.min && s < b.max);
      if (idx === -1) idx = BUCKETS.length - 1; // s === 100
      counts[idx].count += 1;
    }
    return counts;
  }, [scores]);

  const clickable = typeof onBucketClick === 'function';

  if (scores.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        No scores to display yet.
      </div>
    );
  }

  // Clicking anywhere in the plot that ISN'T a bar clears the filter. recharts'
  // BarChart.onClick only fires reliably over a bar's column band (the gaps
  // between bars often fire nothing), so we don't rely on it for clearing —
  // the wrapper <div> below catches every empty-space click. The Bar's own
  // onClick handles filtering and stops propagation so it doesn't also clear.
  const handleBackgroundClick = () => {
    if (activeBucket && onClear) onClear();
  };

  return (
    <div className="relative w-full" onClick={handleBackgroundClick}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
          style={{ cursor: clickable ? 'pointer' : undefined }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={chartColor('border')} vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
          <Tooltip cursor={{ fill: chartColor('primary', 0.06) }} content={<DistTooltip />} />
          <Bar
            dataKey="count"
            name="Customers"
            radius={[4, 4, 0, 0]}
            maxBarSize={64}
            tabIndex={-1}
            focusable={false}
            onClick={(
              entry: { min?: number; max?: number },
              _idx: number,
              e?: { stopPropagation?: () => void },
            ) => {
              e?.stopPropagation?.();
              if (clickable && entry?.min !== undefined && entry?.max !== undefined) {
                onBucketClick!(entry.min, entry.max);
              }
            }}
          >
            {data.map((d) => (
              <Cell
                key={d.label}
                fill={chartColor('primary')}
                fillOpacity={activeBucket && activeBucket !== d.label ? 0.3 : 1}
                tabIndex={-1}
                focusable={false}
                style={{ cursor: clickable ? 'pointer' : 'default' }}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default ScoreDistributionChart;
