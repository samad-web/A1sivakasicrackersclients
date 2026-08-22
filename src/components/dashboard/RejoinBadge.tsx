interface RejoinBadgeProps {
  score: number | null;
  tier: string | null;
  compact?: boolean;
}

// Colors mirror the analytics dashboard tiers.
const TIER_STYLES: Record<string, { text: string; bg: string; bar: string }> = {
  High: { text: 'text-emerald-600', bg: 'bg-emerald-500/12', bar: 'bg-emerald-500' },
  Medium: { text: 'text-amber-600', bg: 'bg-amber-500/15', bar: 'bg-amber-500' },
  Low: { text: 'text-rose-600', bg: 'bg-rose-500/12', bar: 'bg-rose-500' },
};

/**
 * Displays a customer's Rejoin Likelihood: a tier pill plus the 0-100 score
 * with a mini progress bar. Renders a neutral placeholder until the score has
 * been computed server-side (rejoin_score is null before the first payment).
 */
export function RejoinBadge({ score, tier, compact }: RejoinBadgeProps) {
  if (score == null || !tier) {
    return <span className="text-[11px] text-muted-foreground font-medium">—</span>;
  }
  const style = TIER_STYLES[tier] ?? TIER_STYLES.Low;

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ${style.bg} ${style.text}`}>
        {tier} · {score}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1 min-w-[72px]">
      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${style.bg} ${style.text}`}>
        {tier}
      </span>
      <div className="flex items-center gap-1.5 w-full">
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${score}%` }} />
        </div>
        <span className="text-[11px] font-black tabular-nums text-foreground">{score}</span>
      </div>
    </div>
  );
}
