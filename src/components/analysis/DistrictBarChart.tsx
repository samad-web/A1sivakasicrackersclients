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

export interface DistrictBarChartProps {
  data: { district: string; avgScore: number; count: number }[];
  height?: number;
  /** Fired when a district bar is clicked — used to drill the leads list down. */
  onBarClick?: (district: string) => void;
  /** Currently drilled-into district, highlighted in the chart. */
  activeDistrict?: string;
  /** Clicking the empty area clears the active district filter. */
  onClear?: () => void;
}

interface DistrictTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: { district: string; avgScore: number; count: number } }>;
}

function DistrictTooltip({ active, payload }: DistrictTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  if (!d) return null;
  return (
    <ChartTooltipShell
      title={d.district}
      rows={[
        { label: 'Avg Score', value: d.avgScore.toFixed(1), color: chartColor('primary') },
        { label: 'Customers', value: d.count },
      ]}
    />
  );
}

export function DistrictBarChart({
  data,
  height = 340,
  onBarClick,
  activeDistrict,
  onClear,
}: DistrictBarChartProps) {
  // Rank by avg score, but only among districts with a representative cohort so
  // a single 95-scoring customer can't top the chart. Fall back to the largest
  // districts if too few clear the threshold.
  const MIN_COHORT = 3;
  const eligible = data.filter((d) => d.count >= MIN_COHORT);
  const pool = eligible.length >= 5 ? eligible : [...data].sort((a, b) => b.count - a.count);
  const top = [...pool].sort((a, b) => b.avgScore - a.avgScore).slice(0, 8);

  const clip = (s: string) => (s.length > 12 ? s.slice(0, 11) + '…' : s);

  // Click a bar → filter to that district; click empty space → clear.
  const handleChartClick = (state: {
    activePayload?: Array<{ payload?: { district?: string } }>;
  }) => {
    const d = state?.activePayload?.[0]?.payload?.district;
    if (d) {
      if (onBarClick) onBarClick(d);
    } else if (activeDistrict && onClear) {
      onClear();
    }
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={top}
        layout="vertical"
        margin={{ top: 4, right: 16, bottom: 4, left: 4 }}
        onClick={handleChartClick}
        style={{ cursor: onBarClick ? 'pointer' : undefined }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={chartColor('border')} horizontal={false} />
        <XAxis
          type="number"
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          domain={[0, 100]}
        />
        <YAxis
          type="category"
          dataKey="district"
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          width={84}
          tickFormatter={clip}
        />
        <Tooltip cursor={{ fill: chartColor('primary', 0.06) }} content={<DistrictTooltip />} />
        <Bar
          dataKey="avgScore"
          name="Avg Score"
          radius={[0, 4, 4, 0]}
          maxBarSize={26}
          tabIndex={-1}
          focusable={false}
        >
          {top.map((d) => (
            <Cell
              key={d.district}
              fill={chartColor('primary')}
              fillOpacity={activeDistrict && activeDistrict !== d.district ? 0.3 : 1}
              tabIndex={-1}
              focusable={false}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default DistrictBarChart;
