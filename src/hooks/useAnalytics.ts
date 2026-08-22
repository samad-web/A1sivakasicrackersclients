import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Order, MonthlyPayment } from '@/types/order';

// The 11 cycle months in payment order (Nov of cycleYear .. Sep of cycleYear+1).
// NOTE: some rows store February misspelled as 'Febraury'; both are tolerated below.
const MONTH_ORDER = [
  'November',
  'December',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
] as const;

const MONTH_LABELS = [
  'Nov',
  'Dec',
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
] as const;

export type Tier = 'High' | 'Medium' | 'Low' | 'Unscored';

export interface TierCount {
  tier: Tier;
  count: number;
  value: number;
}

export interface DistrictStat {
  district: string;
  count: number;
  avgScore: number;
  highCount: number;
  value: number;
}

export interface SchemeStat {
  scheme: string;
  count: number;
  avgScore: number;
  value: number;       // total book value for this scheme
  high: number;        // customers in High tier
  medium: number;
  low: number;
  collectionRate: number; // % of due installments completed, for this scheme
}

export interface MonthTrend {
  month: string;
  label: string;          // short month, e.g. 'Nov'
  year: number;           // calendar year this cycle-month falls in (Nov/Dec = cycleYear, Jan..Sep = cycleYear+1)
  labelWithYear: string;  // e.g. "Nov '25" — used by the year-aware range filter
  collected: number;      // installments marked completed in this month
  expected: number;       // orders participating in this month (cohort size)
  cumulativePct: number;  // running % of all cycle installments completed by this month
}

export interface LeadRow {
  id: string;
  receipt_no: string;
  name: string;
  number: string;
  district: string;
  type: string;
  scheme: string;
  value: number;
  paid: number;
  term: number;
  streak: number;
  score: number;
  tier: Tier;
  seq: number[]; // 11 ints, month order Nov..Sep, 1 if that month completed else 0
}

export interface AnalyticsData {
  totalCustomers: number;
  avgScore: number;
  tiers: TierCount[];
  highValue: number;
  totalValue: number;
  collectionRate: number;
  districts: DistrictStat[];
  schemes: SchemeStat[];
  monthly: MonthTrend[];
  leads: LeadRow[];
}

// Normalize a month_name to its canonical index in MONTH_ORDER.
// Case-insensitive and tolerant of the 'Febraury' misspelling. Returns -1 if unknown.
function monthIndex(rawName: string | null | undefined): number {
  if (!rawName) return -1;
  const name = rawName.trim().toLowerCase();
  if (name === 'febraury' || name === 'february') {
    return MONTH_ORDER.indexOf('February');
  }
  return MONTH_ORDER.findIndex((m) => m.toLowerCase() === name);
}

// Normalize a district name so casing / whitespace variants merge into one
// bucket (e.g. 'thiruvallur ', 'Thiruvallur', 'THIRUVALLUR' -> 'Thiruvallur').
// Without this, districts fragment and the chart shows many 1-customer entries.
function normalizeDistrict(raw: string | null | undefined): string {
  const s = (raw ?? '').trim();
  if (!s) return 'Unspecified';
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Normalize a scheme value so '500', '500 ', ' 500', and numeric 500 all map to
// the same bucket. Purely numeric schemes collapse to their number as a string.
function normalizeScheme(raw: string | number | null | undefined): string {
  const s = String(raw ?? '').trim();
  if (!s) return 'Unspecified';
  const num = parseFloat(s.replace(/[^\d.]/g, ''));
  return Number.isFinite(num) && String(num) === s.replace(/[^\d.]/g, '') ? String(num) : s;
}

/** True when a scheme label is a real numeric amount (so the ₹ prefix applies). */
export function isNumericScheme(scheme: string): boolean {
  return /^\d+(\.\d+)?$/.test(scheme);
}

// Determine the scheme term (number of monthly installments) from the type
// string. Matches a standalone number followed by "month(s)", tolerant of case
// and spacing; defaults to 10 (the common scheme) when unclear.
function schemeTerm(type: string | null | undefined): number {
  const m = /(\d{1,2})\s*month/i.exec(type ?? '');
  if (m) {
    const n = parseInt(m[1], 10);
    if (n === 12) return 12;
    if (n === 10) return 10;
    return n; // respect other explicit terms
  }
  return /\b12\b/.test(type ?? '') ? 12 : 10;
}

// Fetch every order for the cycle with ALL of its monthly_payments (left join),
// paginating in batches of 1000 (Supabase caps each request at 1000 rows).
async function fetchAllOrdersForCycle(cycleYear: number): Promise<Order[]> {
  // A cycle starts in November of cycleYear and ends in September of cycleYear + 1.
  const startDate = new Date(cycleYear, 10, 1).toISOString(); // Nov 1
  const endDate = new Date(cycleYear + 1, 9, 1).toISOString(); // Oct 1 (exclusive)

  const BATCH = 1000;
  const all: Order[] = [];
  let from = 0;

  // Loop until a batch returns fewer than BATCH rows.
  for (;;) {
    const { data, error } = await supabase
      .from('orders')
      .select('*, rejoin_score, rejoin_tier, monthly_payments(*)')
      .gte('created_at', startDate)
      .lt('created_at', endDate)
      .order('receipt_no', { ascending: true })
      .range(from, from + BATCH - 1);

    if (error) throw error;

    const rows = (data as unknown as Order[]) ?? [];
    all.push(...rows);

    if (rows.length < BATCH) break;
    from += BATCH;
  }

  return all;
}

// Number of cycle months elapsed since Nov of cycleYear (1-based), clamped to [1, term].
function elapsedMonths(cycleYear: number, term: number, now: Date): number {
  const cycleStart = new Date(cycleYear, 10, 1); // Nov 1 of cycleYear
  const monthsPassed =
    (now.getFullYear() - cycleStart.getFullYear()) * 12 +
    (now.getMonth() - cycleStart.getMonth()) +
    1; // +1 so that within November itself the first installment is due
  return Math.max(1, Math.min(term, monthsPassed));
}

function computeAnalytics(orders: Order[], cycleYear: number): AnalyticsData {
  const now = new Date();

  const leads: LeadRow[] = [];

  // Tier tallies.
  const tierMap: Record<Tier, { count: number; value: number }> = {
    High: { count: 0, value: 0 },
    Medium: { count: 0, value: 0 },
    Low: { count: 0, value: 0 },
    Unscored: { count: 0, value: 0 },
  };

  // District aggregates.
  const districtMap = new Map<
    string,
    { count: number; scoreSum: number; scoredCount: number; highCount: number; value: number }
  >();

  // Scheme aggregates — the primary "data reality" dimension.
  const schemeMap = new Map<
    string,
    {
      count: number; scoreSum: number; scoredCount: number;
      value: number; high: number; medium: number; low: number;
      due: number; completedDue: number;
    }
  >();

  // Monthly trend: collected[i] and expected[i].
  const collected = new Array<number>(MONTH_ORDER.length).fill(0);
  const expected = new Array<number>(MONTH_ORDER.length).fill(0);

  let totalValue = 0;
  let scoreSum = 0;
  let scoredCount = 0;

  // Collection-rate accumulators (installment level).
  let dueTotal = 0;
  let completedAmongDueTotal = 0;

  for (const order of orders) {
    const value = Number(order.value) || 0;
    totalValue += value;

    const term = schemeTerm(order.type);

    // Which of the 11 month slots this order participates in.
    // 12-month orders cover all slots (0..10). 10-month orders skip Nov/Dec (start at Jan, index 2).
    const firstSlot = term === 12 ? 0 : 2;
    // Number of slots this order can actually be paid in (bounded by the array).
    const participatingSlots = MONTH_ORDER.length - firstSlot;

    // Build the completed set for this order's months.
    const payments: MonthlyPayment[] = order.monthly_payments ?? [];
    const completedSlots = new Set<number>();
    for (const p of payments) {
      // Tolerate imported values like 'Completed ' (trailing space) and casing.
      if ((p.payment_status ?? '').trim().toLowerCase() !== 'completed') continue;
      const idx = monthIndex(p.month_name);
      if (idx >= 0) completedSlots.add(idx);
    }

    // seq: 0/1 per the 11 months in order.
    const seq: number[] = MONTH_ORDER.map((_, i) => (completedSlots.has(i) ? 1 : 0));
    const paid = seq.reduce((s, v) => s + v, 0);

    // streak: consecutive completed months from the first cycle month the order participates in.
    let streak = 0;
    for (let i = firstSlot; i < MONTH_ORDER.length; i++) {
      if (completedSlots.has(i)) streak++;
      else break;
    }

    // score / tier: prefer stored values on the order.
    let score: number;
    let tier: Tier;
    if (order.rejoin_score === null || order.rejoin_score === undefined) {
      score = 0;
      tier = 'Unscored';
    } else {
      score = order.rejoin_score;
      tier = (order.rejoin_tier as Tier | null) ?? 'Unscored';
    }

    const isScored = tier !== 'Unscored';
    if (isScored) {
      scoreSum += score;
      scoredCount++;
    }

    // Tier tally.
    tierMap[tier].count++;
    tierMap[tier].value += value;

    // District aggregate — normalized so spelling/casing variants merge.
    const districtKey = normalizeDistrict(order.district);
    const dEntry =
      districtMap.get(districtKey) ??
      { count: 0, scoreSum: 0, scoredCount: 0, highCount: 0, value: 0 };
    dEntry.count++;
    dEntry.value += value;
    if (isScored) {
      dEntry.scoreSum += score;
      dEntry.scoredCount++;
    }
    if (tier === 'High') dEntry.highCount++;
    districtMap.set(districtKey, dEntry);

    // Monthly trend contributions.
    for (let i = firstSlot; i < MONTH_ORDER.length; i++) {
      expected[i]++;
      if (completedSlots.has(i)) collected[i]++;
    }

    // Collection rate: how many of the installments due-by-now have been paid.
    // `due` is bounded by BOTH the elapsed months and the slots this order can
    // actually be paid in (participatingSlots), fixing the 10-month off-by-one.
    const elapsed = elapsedMonths(cycleYear, term, now);
    const due = Math.min(term, elapsed, participatingSlots);
    dueTotal += due;
    // In a savings scheme ANY completed installment counts toward what's owed —
    // payments are often bulk/advance-marked in later months, so we must NOT
    // require them to land in the earliest slots. Count all completed
    // participating slots, capped at `due`.
    const completedParticipating = [...completedSlots].filter((i) => i >= firstSlot).length;
    const completedAmongDue = Math.min(due, completedParticipating);
    completedAmongDueTotal += completedAmongDue;

    // Scheme aggregate — the primary "data reality" lens, enriched with tier
    // split, value, and this order's own collection contribution.
    const schemeKey = normalizeScheme(order.scheme);
    const sEntry =
      schemeMap.get(schemeKey) ??
      { count: 0, scoreSum: 0, scoredCount: 0, value: 0, high: 0, medium: 0, low: 0, due: 0, completedDue: 0 };
    sEntry.count++;
    sEntry.value += value;
    sEntry.due += due;
    sEntry.completedDue += completedAmongDue;
    if (isScored) {
      sEntry.scoreSum += score;
      sEntry.scoredCount++;
    }
    if (tier === 'High') sEntry.high++;
    else if (tier === 'Medium') sEntry.medium++;
    else if (tier === 'Low') sEntry.low++;
    schemeMap.set(schemeKey, sEntry);

    leads.push({
      id: order.id,
      receipt_no: order.receipt_no,
      name: order.name,
      number: order.number,
      district: districtKey,
      type: order.type,
      scheme: schemeKey,
      value,
      paid,
      term,
      streak,
      score,
      tier,
      seq,
    });
  }

  const totalCustomers = orders.length;

  const avgScore =
    scoredCount > 0 ? Math.round((scoreSum / scoredCount) * 10) / 10 : 0;

  const collectionRate =
    dueTotal > 0 ? Math.round((completedAmongDueTotal / dueTotal) * 1000) / 10 : 0;

  // Tiers: always High/Medium/Low, plus Unscored only if any exist.
  const tiers: TierCount[] = (['High', 'Medium', 'Low'] as Tier[]).map((t) => ({
    tier: t,
    count: tierMap[t].count,
    value: tierMap[t].value,
  }));
  if (tierMap.Unscored.count > 0) {
    tiers.push({
      tier: 'Unscored',
      count: tierMap.Unscored.count,
      value: tierMap.Unscored.value,
    });
  }

  const highValue = tierMap.High.value;

  // Districts sorted by count desc.
  const districts: DistrictStat[] = Array.from(districtMap.entries())
    .map(([district, e]) => ({
      district,
      count: e.count,
      avgScore: e.scoredCount > 0 ? Math.round((e.scoreSum / e.scoredCount) * 10) / 10 : 0,
      highCount: e.highCount,
      value: e.value,
    }))
    .sort((a, b) => b.count - a.count);

  // Schemes sorted by scheme numeric desc.
  const schemes: SchemeStat[] = Array.from(schemeMap.entries())
    .map(([scheme, e]) => ({
      scheme,
      count: e.count,
      avgScore: e.scoredCount > 0 ? Math.round((e.scoreSum / e.scoredCount) * 10) / 10 : 0,
      value: e.value,
      high: e.high,
      medium: e.medium,
      low: e.low,
      collectionRate: e.due > 0 ? Math.round((e.completedDue / e.due) * 1000) / 10 : 0,
    }))
    .sort((a, b) => (parseFloat(b.scheme) || 0) - (parseFloat(a.scheme) || 0));

  // Cumulative collection progress against the FULL book of scheduled
  // installments (sum of every order's participating months). This is the
  // honest denominator: the line reaches 100% only if everything owed across
  // the whole cycle is collected — it will plateau below 100% otherwise,
  // instead of falsely topping out at 100% like a "% of completions" measure.
  const totalScheduled = expected.reduce((s, v) => s + v, 0);
  let runningCompleted = 0;
  const monthly: MonthTrend[] = MONTH_ORDER.map((month, i) => {
    runningCompleted += collected[i];
    // Nov & Dec belong to cycleYear; Jan..Sep roll into cycleYear + 1.
    const year = i <= 1 ? cycleYear : cycleYear + 1;
    return {
      month,
      label: MONTH_LABELS[i],
      year,
      labelWithYear: `${MONTH_LABELS[i]} '${String(year).slice(-2)}`,
      collected: collected[i],
      expected: expected[i],
      cumulativePct:
        totalScheduled > 0
          ? Math.round((runningCompleted / totalScheduled) * 1000) / 10
          : 0,
    };
  });

  // Leads sorted by score desc.
  const sortedLeads = [...leads].sort((a, b) => b.score - a.score);

  return {
    totalCustomers,
    avgScore,
    tiers,
    highValue,
    totalValue,
    collectionRate,
    districts,
    schemes,
    monthly,
    leads: sortedLeads,
  };
}

/**
 * Fetches all orders for a cycle year (with their full monthly_payments) and
 * aggregates them into analytics for the Analysis dashboard.
 * Auto-syncs: re-fetches whenever cycleYear changes.
 */
export function useAnalytics(cycleYear: number) {
  return useQuery<AnalyticsData>({
    queryKey: ['analytics', cycleYear],
    queryFn: async () => {
      const orders = await fetchAllOrdersForCycle(cycleYear);
      return computeAnalytics(orders, cycleYear);
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}
