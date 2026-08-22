import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AXIS_TICK, chartColor } from './chartTheme';
import { ChartTooltipShell } from './ChartTooltip';

export interface MonthlyTrendChartProps {
  data: {
    label: string;
    year?: number;
    labelWithYear?: string;
    collected: number;
    expected: number;
    cumulativePct: number;
  }[];
  height?: number;
}

interface TrendTooltipProps {
  active?: boolean;
  label?: string;
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string }>;
}

function TrendTooltip({ active, label, payload }: TrendTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const rows = payload.map((p) => ({
    label: String(p.name),
    value: p.dataKey === 'cumulativePct' ? `${p.value}%` : p.value,
    color: p.color,
  }));
  return <ChartTooltipShell title={label} rows={rows} />;
}

/**
 * Honest collection trend:
 *  - Bars = installments marked completed in each month (the real, back-loaded
 *    data-entry shape — many later months were advance/bulk-marked).
 *  - Line = CUMULATIVE % of the full scheduled book collected by that month, so
 *    it shows true progress and only reaches 100% if everything owed is paid.
 */
export function MonthlyTrendChart({ data, height = 320 }: MonthlyTrendChartProps) {
  const primary = chartColor('primary');
  const success = chartColor('success');
  const grid = chartColor('border');

  // Cap the % axis just above the peak so a plateau below 100% is visible.
  const peakPct = Math.max(0, ...data.map((d) => d.cumulativePct));
  const rightMax = Math.min(100, Math.max(20, Math.ceil((peakPct + 5) / 10) * 10));

  // If the visible window spans more than one calendar year, disambiguate the
  // x-axis with the year (e.g. "Dec '25" vs "Jan '26"); otherwise keep it short.
  const spansMultipleYears =
    new Set(data.map((d) => d.year).filter((y) => y !== undefined)).size > 1;
  const xKey = spansMultipleYears && data.every((d) => d.labelWithYear) ? 'labelWithYear' : 'label';

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 12, right: 8, bottom: 4, left: -12 }}>
        <defs>
          <linearGradient id="mt-bar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={primary} stopOpacity={0.9} />
            <stop offset="100%" stopColor={primary} stopOpacity={0.55} />
          </linearGradient>
          <linearGradient id="mt-line" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={success} stopOpacity={0.25} />
            <stop offset="100%" stopColor={success} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <YAxis
          yAxisId="left"
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          domain={[0, rightMax]}
          tickFormatter={(v) => `${v}%`}
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip cursor={{ fill: chartColor('primary', 0.06) }} content={<TrendTooltip />} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12, fontWeight: 600 }} />
        <Bar
          yAxisId="left"
          dataKey="collected"
          name="Completed"
          fill="url(#mt-bar)"
          radius={[4, 4, 0, 0]}
          maxBarSize={26}
          tabIndex={-1}
          focusable={false}
        />
        <Area
          yAxisId="right"
          type="monotone"
          dataKey="cumulativePct"
          name="Cumulative % collected"
          stroke={success}
          strokeWidth={2.5}
          fill="url(#mt-line)"
          dot={{ r: 3, fill: success, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export default MonthlyTrendChart;
