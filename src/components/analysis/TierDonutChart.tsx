import { useState } from 'react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { chartColor, TIER_COLORS } from './chartTheme';

export interface TierDonutChartProps {
  data: { tier: string; count: number }[];
  height?: number;
  /** Click a tier segment to drill the leads list to that tier. */
  onTierClick?: (tier: string) => void;
  /** Currently active tier — dims the others. */
  activeTier?: string;
  /** Clicking the empty area (not a segment) clears the active filter. */
  onClear?: () => void;
}

function tierColor(tier: string): string {
  const token = TIER_COLORS[tier] ?? 'primary';
  return chartColor(token);
}

export function TierDonutChart({
  data,
  height = 300,
  onTierClick,
  activeTier,
  onClear,
}: TierDonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const clickable = typeof onTierClick === 'function';

  // Which segment the cursor is over — drives the center readout instead of a
  // floating tooltip (which would overlap the center label).
  const [hovered, setHovered] = useState<string | null>(null);

  if (total === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        No tiered customers yet.
      </div>
    );
  }

  const focus = hovered ?? activeTier ?? null;
  const focusItem = focus ? data.find((d) => d.tier === focus) : null;
  const focusPct =
    focusItem && total > 0 ? ((focusItem.count / total) * 100).toFixed(1) : null;

  // Clicking the empty area (anywhere that isn't a segment) clears the filter.
  const handleBackgroundClick = () => {
    if (activeTier && onClear) onClear();
  };

  return (
    <div
      className="relative w-full [&_svg]:outline-none [&_*:focus]:outline-none [&_.recharts-sector]:outline-none"
      onClick={handleBackgroundClick}
    >
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="tier"
            cx="50%"
            cy="50%"
            innerRadius="60%"
            outerRadius="84%"
            paddingAngle={2}
            stroke="hsl(var(--card))"
            strokeWidth={2}
            isAnimationActive={false}
            tabIndex={-1}
            focusable={false}
            cursor={clickable ? 'pointer' : undefined}
            onMouseLeave={() => setHovered(null)}
            onClick={(entry: { tier?: string }, _idx: number, e?: { stopPropagation?: () => void }) => {
              e?.stopPropagation?.();
              if (clickable && entry?.tier) onTierClick!(entry.tier);
            }}
          >
            {data.map((entry) => (
              <Cell
                key={entry.tier}
                fill={tierColor(entry.tier)}
                fillOpacity={focus && focus !== entry.tier ? 0.3 : 1}
                tabIndex={-1}
                focusable={false}
                onMouseEnter={() => setHovered(entry.tier)}
                style={{ outline: 'none', cursor: clickable ? 'pointer' : 'default' }}
              />
            ))}
          </Pie>
          <Legend
            verticalAlign="bottom"
            height={36}
            iconType="circle"
            wrapperStyle={{ fontSize: 12, fontWeight: 600 }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Center readout — shows the hovered/active tier, or the total otherwise.
          Replaces a floating tooltip so nothing overlaps the center. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center justify-center"
        style={{ height: height - 36 }}
      >
        {focusItem ? (
          <>
            <span
              className="text-3xl font-black leading-none tabular-nums"
              style={{ color: tierColor(focusItem.tier) }}
            >
              {focusItem.count}
            </span>
            <span className="mt-1 text-[11px] font-black uppercase tracking-wider text-muted-foreground">
              {focusItem.tier} · {focusPct}%
            </span>
          </>
        ) : (
          <>
            <span className="text-3xl font-black text-foreground leading-none tabular-nums">
              {total}
            </span>
            <span className="mt-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground/80">
              Total
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export default TierDonutChart;
