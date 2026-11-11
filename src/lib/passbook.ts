import type { Order } from '@/types/order';

export interface PassbookPayment {
  month_name: string;
  payment_status: string | null;
  payment_date: string | null;
}

export type InstallmentStatus = 'PAID' | 'PAID [OK]' | 'PAY DUE' | 'UPCOMING';

export interface PassbookRow {
  inst: string;          // "01"
  dueMonth: string;      // "Month 1 (Nov 2026)"
  dueDate: string;       // "10-Nov-2026"
  amount: number;
  paidOn: string | null; // "08-Nov-2026 (UPI)"
  status: InstallmentStatus;
}

export interface PassbookData {
  invoiceNo: string;
  name: string;
  phone: string;
  address: string;
  term: number;
  monthly: number;
  planValue: number;
  rows: PassbookRow[];
  paidCount: number;
  paidAmount: number;
  remaining: number;
  diwali: { year: number; day: number; month: string; weekday: string } | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Diwali by Gregorian year. Add the next year's date here before each new cycle starts.
const DIWALI: Record<number, string> = {
  2027: '2027-10-29',
};

const UPI_APPS = ['gpay', 'google pay', 'phone pay', 'phonepe', 'paytm', 'upi'];

const fmtDate = (d: Date) => `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;

export const formatRs = (n: number) =>
  `Rs. ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatPhone = (raw: string | null | undefined) => {
  const digits = (raw ?? '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  return digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : (raw ?? '').trim();
};

const paymentRef = (mode: string | null | undefined) => {
  const m = (mode ?? '').trim();
  if (!m) return 'UPI';
  return UPI_APPS.includes(m.toLowerCase()) ? 'UPI' : m.replace(/\b\w/g, c => c.toUpperCase());
};

/** Cycle start year: an order created Nov–Dec starts that year's cycle, Jan–Oct the previous year's. */
const cycleStartYear = (createdAt: string, fallback: Date) => {
  const d = createdAt ? new Date(createdAt) : fallback;
  const valid = isNaN(d.getTime()) ? fallback : d;
  return valid.getMonth() >= 10 ? valid.getFullYear() : valid.getFullYear() - 1;
};

export function buildPassbook(order: Order, payments: PassbookPayment[], today: Date = new Date()): PassbookData {
  const term = parseInt(order.type, 10) || 12;
  const planValue = Number(order.value) || 0;
  const monthly = Number(order.scheme) || (term ? planValue / term : 0);
  const startYear = cycleStartYear(order.created_at, today);
  const nowKey = today.getFullYear() * 12 + today.getMonth();

  const byMonth = new Map(payments.map(p => [p.month_name.trim().toLowerCase(), p]));

  let paidSeen = 0;
  const rows: PassbookRow[] = Array.from({ length: term }, (_, i) => {
    const due = new Date(startYear, 10 + i, 10);
    const p = byMonth.get(FULL_MONTHS[due.getMonth()].toLowerCase());
    const paid = (p?.payment_status ?? '').trim().toLowerCase() === 'completed';
    // Client rule (2026-11-11): October is A1's Diwali bonus month — always paid, counted in totals.
    const bonus = due.getMonth() === 9;

    let status: InstallmentStatus;
    let paidOn: string | null = null;
    if (paid || bonus) {
      status = paidSeen === 0 ? 'PAID' : 'PAID [OK]';
      paidSeen++;
      const when = p?.payment_date ? new Date(p.payment_date) : null;
      paidOn = bonus ? 'Diwali Offer'
        : `${when && !isNaN(when.getTime()) ? fmtDate(when) : '—'} (${paymentRef(order.payment_mode)})`;
    } else {
      status = due.getFullYear() * 12 + due.getMonth() <= nowKey ? 'PAY DUE' : 'UPCOMING';
    }

    return {
      inst: String(i + 1).padStart(2, '0'),
      dueMonth: `Month ${i + 1} (${MONTHS[due.getMonth()]} ${due.getFullYear()})`,
      dueDate: fmtDate(due),
      amount: monthly,
      paidOn,
      status,
    };
  });

  const paidCount = rows.filter(r => r.status.startsWith('PAID')).length;
  const paidAmount = paidCount * monthly;
  const diwaliIso = DIWALI[startYear + 1];
  const diwaliDate = diwaliIso ? new Date(`${diwaliIso}T00:00:00`) : null;

  const secondary = order.secondary_number?.trim() ? formatPhone(order.secondary_number) : '';

  return {
    invoiceNo: `A1SC-${order.receipt_no}`,
    name: order.name,
    phone: [formatPhone(order.number), secondary].filter(Boolean).join(' / '),
    address: order.customer_address ?? '',
    term,
    monthly,
    planValue,
    rows,
    paidCount,
    paidAmount,
    remaining: Math.max(planValue - paidAmount, 0),
    diwali: diwaliDate && {
      year: diwaliDate.getFullYear(),
      day: diwaliDate.getDate(),
      month: FULL_MONTHS[diwaliDate.getMonth()],
      weekday: diwaliDate.toLocaleDateString('en-US', { weekday: 'long' }),
    },
  };
}
