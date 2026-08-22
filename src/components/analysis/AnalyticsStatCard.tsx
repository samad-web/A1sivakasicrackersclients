import { useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export type StatCardTone = 'primary' | 'success' | 'info' | 'warning' | 'danger';

export interface AnalyticsStatCardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
  description?: string;
  tone?: StatCardTone;
  /** When set, the card becomes a button that filters the leads list. */
  onClick?: () => void;
  /** Highlights the card as the active filter. */
  active?: boolean;
  /** Plain-language explanation shown in an ⓘ hover tooltip. */
  info?: string;
}

/**
 * Modern KPI card: a solid gradient icon chip, a bold value, a colored accent
 * glow, and a vivid active state. Tones map to the app's status palette.
 */
const TONES: Record<
  StatCardTone,
  { iconBg: string; glow: string; ring: string; accent: string; pill: string }
> = {
  primary: {
    iconBg: 'bg-gradient-to-br from-blue-500 to-indigo-600',
    glow: 'bg-blue-500/20',
    ring: 'ring-blue-500',
    accent: 'from-blue-500/70 to-indigo-600/70',
    pill: 'bg-blue-500/10 text-blue-600',
  },
  success: {
    iconBg: 'bg-gradient-to-br from-emerald-500 to-green-600',
    glow: 'bg-emerald-500/20',
    ring: 'ring-emerald-500',
    accent: 'from-emerald-500/70 to-green-600/70',
    pill: 'bg-emerald-500/10 text-emerald-600',
  },
  info: {
    iconBg: 'bg-gradient-to-br from-sky-400 to-blue-500',
    glow: 'bg-sky-500/20',
    ring: 'ring-sky-500',
    accent: 'from-sky-400/70 to-blue-500/70',
    pill: 'bg-sky-500/10 text-sky-600',
  },
  warning: {
    iconBg: 'bg-gradient-to-br from-amber-400 to-amber-500',
    glow: 'bg-amber-500/20',
    ring: 'ring-amber-500',
    accent: 'from-amber-400/70 to-amber-500/70',
    pill: 'bg-amber-500/10 text-amber-600',
  },
  danger: {
    iconBg: 'bg-gradient-to-br from-rose-500 to-red-600',
    glow: 'bg-rose-500/20',
    ring: 'ring-rose-500',
    accent: 'from-rose-500/70 to-red-600/70',
    pill: 'bg-rose-500/10 text-rose-600',
  },
};

export function AnalyticsStatCard({
  title,
  value,
  icon,
  description,
  tone = 'primary',
  onClick,
  active = false,
  info,
}: AnalyticsStatCardProps) {
  const t = TONES[tone];
  const clickable = typeof onClick === 'function';
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <div
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={`group relative overflow-hidden rounded-2xl bg-card border border-border/60 p-5 shadow-sm transition-all duration-300 ${
        clickable
          ? 'cursor-pointer hover:-translate-y-1 hover:shadow-xl active:translate-y-0'
          : 'hover:-translate-y-0.5 hover:shadow-lg'
      } ${active ? `ring-2 ${t.ring} shadow-lg` : ''}`}
    >
      {/* Accent strip */}
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${t.accent}`} />
      {/* Soft corner glow */}
      <div
        className={`absolute -top-10 -right-10 h-28 w-28 rounded-full blur-2xl transition-opacity duration-500 ${t.glow} opacity-60 group-hover:opacity-100`}
      />

      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <span className="truncate">{title}</span>
            {info && (
              <Tooltip open={infoOpen} onOpenChange={setInfoOpen} delayDuration={80}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setInfoOpen((o) => !o);
                    }}
                    onMouseEnter={() => setInfoOpen(true)}
                    onMouseLeave={() => setInfoOpen(false)}
                    className="flex-shrink-0 flex h-4 w-4 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-primary hover:text-white transition-colors"
                    aria-label={`About ${title}`}
                  >
                    <Info className="h-2.5 w-2.5" />
                  </button>
                </TooltipTrigger>
                <TooltipPrimitive.Portal>
                  <TooltipContent
                    side="top"
                    sideOffset={6}
                    collisionPadding={12}
                    className="z-[100] max-w-[260px] bg-popover text-popover-foreground border border-border text-xs leading-relaxed normal-case font-medium shadow-xl"
                  >
                    {info}
                  </TooltipContent>
                </TooltipPrimitive.Portal>
              </Tooltip>
            )}
          </p>
          <p className="mt-1.5 text-3xl font-extrabold leading-none text-foreground tabular-nums">
            {value}
          </p>
          {description && (
            <span
              className={`mt-2.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${t.pill}`}
            >
              {description}
            </span>
          )}
        </div>
        {icon && (
          <div
            className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-white shadow-md ${t.iconBg}`}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

export default AnalyticsStatCard;
