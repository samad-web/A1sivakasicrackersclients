/**
 * Shared chart theme helpers for the Analysis dashboard.
 *
 * recharts needs concrete color strings (it cannot resolve CSS `hsl(var(--x))`
 * at render time for SVG fills/strokes), so we read the design tokens off
 * :root at runtime and wrap them in `hsl(...)`. If the token can't be read
 * (SSR / test env), we fall back to the literal brand values.
 */

export type ChartColorToken =
  | 'primary'
  | 'success'
  | 'warning'
  | 'info'
  | 'danger'
  | 'border'
  | 'muted-foreground';

const FALLBACKS: Record<ChartColorToken, string> = {
  primary: '221 83% 53%',
  success: '142 76% 45%',
  warning: '38 92% 50%',
  info: '217 91% 60%',
  danger: '350 89% 60%',
  border: '220 13% 91%',
  'muted-foreground': '220 9% 46%',
};

/** Read a `--token` triplet from :root, falling back to the brand literal. */
function readToken(token: ChartColorToken): string {
  if (typeof window !== 'undefined' && typeof getComputedStyle === 'function') {
    try {
      const raw = getComputedStyle(document.documentElement)
        .getPropertyValue(`--${token}`)
        .trim();
      if (raw) return raw;
    } catch {
      /* ignore and use fallback */
    }
  }
  return FALLBACKS[token];
}

/** Returns a concrete `hsl(...)` color for a design token, with optional alpha. */
export function chartColor(token: ChartColorToken, alpha = 1): string {
  const triplet = readToken(token);
  if (alpha >= 1) return `hsl(${triplet})`;
  return `hsl(${triplet} / ${alpha})`;
}

/** Semantic colors for High / Medium / Low tiers. */
export const TIER_COLORS: Record<string, ChartColorToken> = {
  High: 'success',
  Medium: 'warning',
  Low: 'danger',
};

/**
 * Shared axis tick styling — thin, recessive, muted. This is a getter (not a
 * frozen const) so it re-reads the token per render and stays correct after a
 * light/dark theme toggle.
 */
export const AXIS_TICK = {
  fontSize: 11,
  get fill() {
    return chartColor('muted-foreground');
  },
} as const;

/**
 * Muted grid color. Kept for backward-compat, but prefer calling
 * `chartColor('border')` inside a component body so it re-reads on theme change.
 */
export const GRID_COLOR = chartColor('border');
