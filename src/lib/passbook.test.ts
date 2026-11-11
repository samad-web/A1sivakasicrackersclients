import { describe, it, expect } from 'vitest';
import { buildPassbook, type PassbookPayment } from './passbook';
import { renderReceiptHtml } from './receiptTemplate';
import type { Order } from '@/types/order';

const order = (extra: Partial<Order> = {}): Order => ({
  id: 'o1', receipt_no: '9', scheme: '2000', value: 24000, name: 'K. Rajesh Kumar', number: '9876543210',
  secondary_number: null, type: '12 Months', district: 'Sivakasi', current_month: null,
  customer_address: '42, Kamarajar Salai, Sivakasi - 626123, Tamil Nadu',
  address_line1: null, address_line2: null, city: null, pincode: null, state: null, payment_mode: 'Gpay',
  payment_verified: true, order_completed: false, invoice_url: null, rejoin_score: null, rejoin_tier: null,
  created_at: '2026-11-03T10:00:00+05:30', updated_at: '', ...extra,
});

const paid = (month: string, date: string): PassbookPayment => ({ month_name: month, payment_status: 'Completed', payment_date: date });
const sample: PassbookPayment[] = [
  paid('November', '2026-11-08T10:00:00+05:30'),
  paid('December', '2026-12-08T10:00:00+05:30'),
  paid('January', '2027-01-08T10:00:00+05:30'),
  paid('February', '2027-02-08T10:00:00+05:30'),
  paid('March', '2027-03-08T10:00:00+05:30'),
  { month_name: 'April', payment_status: 'Empty', payment_date: null },
];
const april = new Date(2027, 3, 5);

describe('Passbook invoice', () => {
  it('AC2: rows match the reference sample (dates, statuses, paid-on)', () => {
    const p = buildPassbook(order(), sample, april);
    expect(p.rows).toHaveLength(12);
    expect(p.rows[0]).toEqual({ inst: '01', dueMonth: 'Month 1 (Nov 2026)', dueDate: '10-Nov-2026', amount: 2000, paidOn: '08-Nov-2026 (UPI)', status: 'PAID' });
    expect(p.rows[1].status).toBe('PAID [OK]');
    expect(p.rows[4]).toMatchObject({ dueMonth: 'Month 5 (Mar 2027)', paidOn: '08-Mar-2027 (UPI)', status: 'PAID [OK]' });
    expect(p.rows[5]).toMatchObject({ dueMonth: 'Month 6 (Apr 2027)', paidOn: null, status: 'PAY DUE' });
    expect(p.rows[6].status).toBe('UPCOMING');
    expect(p.rows[11]).toMatchObject({ dueMonth: 'Month 12 (Oct 2027)', dueDate: '10-Oct-2027', status: 'PAID [OK]', paidOn: 'Diwali Offer' });
    expect(p.invoiceNo).toBe('A1SC-9');
  });

  it('AC3: totals match the reference and paid + remaining = plan value', () => {
    const p = buildPassbook(order(), sample, april);
    expect(p).toMatchObject({ planValue: 24000, monthly: 2000, paidCount: 6, paidAmount: 12000, remaining: 12000 });
    expect(p.paidAmount + p.remaining).toBe(p.planValue);
  });

  it('AC2: every unpaid month that has come due is PAY DUE', () => {
    const p = buildPassbook(order(), sample.slice(0, 2), april);
    expect(p.rows.slice(2, 6).every(r => r.status === 'PAY DUE')).toBe(true);
  });

  it('AC4: advance payment shows future months as PAID', () => {
    const p = buildPassbook(order(), [...sample, paid('April', '2027-04-02'), paid('May', '2027-04-02'), paid('June', '2027-04-02')], april);
    expect(p.rows.slice(5, 8).map(r => r.status)).toEqual(['PAID [OK]', 'PAID [OK]', 'PAID [OK]']);
  });

  it('AC2: 10-month scheme renders 10 rows and the 10-MONTH title', () => {
    const p = buildPassbook(order({ type: '10 Month', scheme: '500', value: 5000 }), [], april);
    expect(p.rows).toHaveLength(10);
    const html = renderReceiptHtml(p);
    expect(html).toContain('10-MONTH CHIT INVOICE');
    expect(html).toContain('all 10 installments');
  });

  it('Edge: payment status is matched case/space-insensitively and cash mode is kept', () => {
    const p = buildPassbook(order({ payment_mode: 'cash' }), [{ month_name: ' november ', payment_status: 'Completed ', payment_date: '2026-11-08' }], april);
    expect(p.rows[0]).toMatchObject({ status: 'PAID', paidOn: '08-Nov-2026 (Cash)' });
  });

  it('Client rule: October is always PAID (Diwali Offer) and counts in totals', () => {
    const allButOct = ['November', 'December', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September']
      .map(m => paid(m, '2027-09-01'));
    const p = buildPassbook(order(), allButOct, new Date(2027, 9, 20));
    expect(p.rows[11]).toMatchObject({ status: 'PAID [OK]', paidOn: 'Diwali Offer' });
    expect(p).toMatchObject({ paidCount: 12, paidAmount: 24000, remaining: 0 });
    // A real October payment still shows as the offer, not double-counted.
    expect(buildPassbook(order(), [...allButOct, paid('October', '2027-10-05')], new Date(2027, 9, 20)).paidAmount).toBe(24000);
  });

  it('Edge: no payments yet → paid 0, nothing negative', () => {
    const p = buildPassbook(order(), [], new Date(2026, 10, 5));
    // Only the October bonus month counts as paid.
    expect(p).toMatchObject({ paidCount: 1, paidAmount: 2000, remaining: 22000 });
  });

  it('AC5: phone has no trailing slash without a secondary number, and joins both when present', () => {
    expect(buildPassbook(order(), [], april).phone).toBe('+91 98765 43210');
    expect(buildPassbook(order({ secondary_number: '9123456789' }), [], april).phone).toBe('+91 98765 43210 / +91 91234 56789');
  });

  it('AC1/AC5: rendered HTML follows the reference and has no mojibake', () => {
    const html = renderReceiptHtml(buildPassbook(order(), sample, april));
    for (const text of [
      '12-MONTH CHIT INVOICE', 'Yearly Plan Passbook Copy', 'A1SC-9', '12-Month Festival Cracker Chit',
      'Rs. 2,000.00 / month', 'Rs. 24,000.00 (12 Months)', 'Completed Months : 6 of 12 Installments Paid',
      'Pending Months : 6 Installments Remaining', 'Total Amount Paid (6M):', 'Rs. 12,000.00',
      '2027 Diwali Date : October 29<sup>th</sup> Friday', 'id="page_0"',
    ]) expect(html).toContain(text);
    expect(html).not.toContain('â€');
    expect(html).not.toContain('CURRENT DUE'); // removed at client request 2026-11-11
  });

  it('Security: customer text is HTML-escaped', () => {
    const html = renderReceiptHtml(buildPassbook(order({ name: '<img src=x onerror=alert(1)>' }), [], april));
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('Edge: cycle with no known Diwali date omits the line', () => {
    const html = renderReceiptHtml(buildPassbook(order({ created_at: '2028-11-03T10:00:00+05:30' }), [], new Date(2028, 10, 5)));
    expect(html).not.toContain('Diwali Date');
  });
});
