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
import { AXIS_TICK, chartColor, GRID_COLOR } from './chartTheme';
import { ChartTooltipShell } from './ChartTooltip';

export interface SchemeBarChartProps {
  data: { scheme: string; count: number; avgScore: number }[];
  height?: number;
}

interface SchemeTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: { scheme: string; count: number; avgScore: number }; color?: string }>;
}

function SchemeTooltip({ active, payload }: SchemeTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  if (!d) return null;
  return (
    <ChartTooltipShell
      title={d.scheme}
      rows={[
        { label: 'Customers', value: d.count, color: payload[0].color },
        { label: 'Avg Score', value: d.avgScore.toFixed(1) },
      ]}
    />
  );
}

export function SchemeBarChart({ data, height = 320 }: SchemeBarChartProps) {
  // Gradient of primary: fade opacity across bars so they read as one family.
  const n = Math.max(data.length - 1, 1);
  const barColor = (i: number) => chartColor('primary', 1 - (i / n) * 0.55);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
        <XAxis
          dataKey="scheme"
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          interval={0}
        />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
        <Tooltip cursor={{ fill: chartColor('primary', 0.06) }} content={<SchemeTooltip />} />
        <Bar dataKey="count" name="Customers" radius={[4, 4, 0, 0]} maxBarSize={56}>
          {data.map((entry, i) => (
            <Cell key={entry.scheme} fill={barColor(i)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default SchemeBarChart;
