import type { TooltipProps } from 'recharts';

export interface TooltipRow {
  label: string;
  value: React.ReactNode;
  color?: string;
}

interface ChartTooltipShellProps {
  title?: React.ReactNode;
  rows: TooltipRow[];
}

/**
 * Premium-card styled tooltip shell shared by every Analysis chart.
 * Rounded, bg-card, border, shadow, small text — matches the app theme.
 */
export function ChartTooltipShell({ title, rows }: ChartTooltipShellProps) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/95 backdrop-blur-xl px-3 py-2 shadow-[0_8px_32px_0_rgba(31,38,135,0.12)]">
      {title !== undefined && title !== '' && (
        <p className="mb-1 text-[11px] font-black uppercase tracking-widest text-muted-foreground/80">
          {title}
        </p>
      )}
      <div className="space-y-0.5">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            {row.color && (
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: row.color }}
              />
            )}
            <span className="font-medium text-muted-foreground">{row.label}</span>
            <span className="ml-auto font-black text-foreground">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Generic default renderer usable directly as a recharts `content` prop. */
export function DefaultChartTooltip({
  active,
  payload,
  label,
}: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <ChartTooltipShell
      title={label}
      rows={payload.map((p) => ({
        label: String(p.name),
        value: p.value as React.ReactNode,
        color: p.color,
      }))}
    />
  );
}
