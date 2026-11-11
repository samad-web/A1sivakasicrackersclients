/**
 * Passbook-style chit invoice, ported from the client's New_Chit_Finance_Invoice.html.
 * The logo is embedded so the offscreen render needs no network access.
 *
 * Kept in its own module because the embedded assets are large: reach it only through the
 * dynamic import in receiptPdf.ts, never a static one, or it lands in the initial bundle.
 */
import { LOGO_PNG } from './invoiceLogo';
import { formatRs, type PassbookData } from './passbook';

const esc = (s: string) =>
    s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const ordinal = (n: number) => {
    const v = n % 100;
    if (v >= 11 && v <= 13) return 'th';
    return ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
};

const STATUS_CLASS: Record<string, string> = {
    'PAID': 'status-paid', 'PAID [OK]': 'status-paid', 'PAY DUE': 'status-due', 'UPCOMING': 'status-upcoming',
};

export function renderReceiptHtml(d: PassbookData): string {
    const n = d.term;
    const rows = d.rows.map(r => `
                        <tr>
                            <td class="text-center font-bold">${r.inst}</td>
                            <td>${esc(r.dueMonth)}</td>
                            <td class="text-center">${r.dueDate}</td>
                            <td class="text-right font-bold">${formatRs(r.amount)}</td>
                            ${r.paidOn
                                ? `<td class="text-center ref-paid">${esc(r.paidOn)}</td>`
                                : `<td class="text-center ref-dash">&ndash;</td>`}
                            <td class="text-center ${STATUS_CLASS[r.status]}">${r.status}</td>
                        </tr>`).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Chit Invoice - ${esc(d.invoiceNo)} | A1 Sivakasi Crackers</title>
<style>
:root {
    --navy: #1a202c; --red: #dc2626; --text-dark: #2d3748; --text-muted: #64748b;
    --border-color: #e2e8f0; --zebra-bg: #f8fafc; --green: #166534; --amber: #b45309;
}
* { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
html, body { width: 794px; height: 1123px; background: #ffffff; }
/* The client's reference PDF was rendered in Arial (web fonts not loaded); match the PDF. */
body { font-family: Arial, Helvetica, sans-serif; color: var(--text-dark); line-height: 1.4; }

.invoice-sheet {
    width: 794px; height: 1123px; background: #ffffff; padding: 14mm 15mm 12mm 15mm;
    position: relative; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden;
}
.invoice-sheet::before {
    content: ""; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: 125mm; height: 125mm; background-image: url('${LOGO_PNG}'); background-repeat: no-repeat;
    background-position: center; background-size: contain; opacity: 0.06; pointer-events: none; z-index: 0;
    /* The app logo has a black background: invert turns it white, hue-rotate restores the colours. */
    filter: invert(1) hue-rotate(180deg);
}
.invoice-content { position: relative; z-index: 1; }

.header-banner { background: var(--navy); color: #ffffff; padding: 12px 14px; border-radius: 4px 4px 0 0; display: flex; align-items: center; gap: 12px; }
.brand-logo { width: 68px; height: 68px; border-radius: 6px; object-fit: cover; border: 1px solid rgba(255,255,255,0.15); background: #fff; flex-shrink: 0; }
.header-center { flex: 1; min-width: 0; }
.brand-name { font-size: 18px; font-weight: 800; letter-spacing: 0.5px; color: #ffffff; margin-bottom: 2px; }
.brand-subtitle { font-size: 11px; color: #cbd5e1; margin-bottom: 2px; }
.brand-contacts, .brand-address { font-size: 9.5px; color: #94a3b8; line-height: 1.35; white-space: nowrap; }
.header-right { text-align: right; flex-shrink: 0; align-self: flex-start; padding-top: 6px; }
.badge-title { font-size: 12.5px; font-weight: 800; color: #ffd700; letter-spacing: 0.5px; text-transform: uppercase; }
.badge-sub { font-size: 10.5px; color: #cbd5e1; margin-top: 2px; }
.red-divider { height: 3px; background: var(--red); width: 100%; margin-bottom: 12px; }

.overview-card { border: 1px solid var(--border-color); border-radius: 4px; padding: 10px 14px; margin-bottom: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; background: #ffffff; }
.section-label { font-size: 10px; font-weight: 700; color: var(--red); letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 4px; }
.member-col { border-right: 1px solid var(--border-color); padding-right: 14px; }
.member-name { font-size: 13.5px; font-weight: 700; color: var(--navy); margin-bottom: 3px; }
.info-line { font-size: 10.5px; color: var(--text-dark); margin-bottom: 2px; }
.scheme-col { padding-left: 2px; }
.meta-table { width: 100%; border-collapse: collapse; }
.meta-table td { font-size: 10.5px; padding: 1.5px 0; }
.meta-label { color: var(--text-muted); width: 125px; }
.meta-val { font-weight: 700; color: var(--navy); text-align: right; }

.table-wrap { margin-bottom: 12px; }
.chit-table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
.chit-table th { background: var(--navy); color: #ffffff; font-weight: 700; padding: 6.5px 8px; font-size: 10.5px; letter-spacing: 0.3px; border: 1px solid var(--navy); }
.chit-table td { padding: 5px 8px; border: 1px solid var(--border-color); color: var(--text-dark); }
.chit-table tr:nth-child(even) td { background-color: var(--zebra-bg); }
.text-center { text-align: center; } .text-right { text-align: right; } .text-left { text-align: left; }
.font-bold { font-weight: 700; }
.col-inst { width: 9%; } .col-month { width: 25%; } .col-due { width: 16%; } .col-amt { width: 16%; } .col-paid { width: 20%; } .col-status { width: 14%; }
.chit-table td.status-paid { color: var(--green); font-weight: 700; font-size: 10px; }
.chit-table td.status-due { color: var(--amber); font-weight: 700; font-size: 10px; }
.chit-table td.status-upcoming { color: #94a3b8; font-size: 10px; }
.chit-table td.ref-paid { color: var(--green); font-size: 10px; }
.chit-table td.ref-dash { color: #cbd5e1; }

.summary-grid { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 20px; align-items: start; margin-bottom: 10px; }
.progress-box { padding: 6px 0; }
.progress-title { font-size: 11px; font-weight: 700; color: var(--navy); margin-bottom: 4px; }
.progress-line { font-size: 10.5px; color: var(--text-dark); margin-bottom: 2px; }
.bonus-note { font-size: 10px; font-style: italic; color: var(--green); margin-top: 4px; }
.totals-table { width: 100%; border-collapse: collapse; }
.totals-table td { padding: 3px 0; font-size: 11px; }
.totals-label { color: var(--text-muted); text-align: right; padding-right: 12px; }
.totals-val { text-align: right; font-weight: 700; color: var(--navy); width: 105px; }
.totals-val.green { color: var(--green); } .totals-val.red { color: var(--red); }

.diwali-milestone { text-align: center; font-size: 12px; font-weight: 700; color: var(--navy); margin: 6px 0 10px 0; letter-spacing: 0.3px; }
.thank-you-banner { background: #fef9c3; border: 1px solid #fde047; padding: 6px 12px; border-radius: 4px; font-size: 10.5px; font-weight: 700; color: #854d0e; margin-bottom: 10px; }
.terms-block { margin-bottom: 12px; }
.terms-title { font-size: 10px; font-weight: 700; color: var(--navy); margin-bottom: 3px; text-transform: uppercase; }
.terms-list { list-style: none; padding-left: 0; }
.terms-list li { font-size: 9.5px; color: var(--text-muted); margin-bottom: 2px; line-height: 1.35; }
.auto-gen-note { text-align: center; font-size: 9.5px; font-style: italic; color: #94a3b8; margin-top: 6px; }
.footer-bar { background: var(--navy); color: #cbd5e1; font-size: 10px; text-align: center; padding: 8px; border-radius: 0 0 4px 4px; letter-spacing: 0.3px; }
</style>
</head>
<body>
    <div class="invoice-sheet" id="page_0">
        <div class="invoice-content">

            <div class="header-banner">
                <img src="${LOGO_PNG}" alt="A1 Sivakasi Crackers" class="brand-logo">
                <div class="header-center">
                    <div class="brand-name">A1 SIVAKASI CRACKERS</div>
                    <div class="brand-subtitle">Monthly Chit Fund Savings Scheme - Sivakasi, Tamil Nadu</div>
                    <div class="brand-contacts">Helpline: +91 63823 13292 / +91 90424 38994 &nbsp;|&nbsp; Email : sivakasicrackers15@gmail.com</div>
                    <div class="brand-address">Address : D.No 3, 267-G1, Sivakasi - Sattur Rd, Konampatty Sivakasi, Tamil Nadu 626189</div>
                </div>
                <div class="header-right">
                    <div class="badge-title">${n}-MONTH CHIT INVOICE</div>
                    <div class="badge-sub">Yearly Plan Passbook Copy</div>
                </div>
            </div>
            <div class="red-divider"></div>

            <div class="overview-card">
                <div class="member-col">
                    <div class="section-label">MEMBER DETAILS</div>
                    <div class="member-name">${esc(d.name)}</div>
                    <div class="info-line"><strong>Phone:</strong> ${esc(d.phone)}</div>
                    <div class="info-line"><strong>Address:</strong> ${esc(d.address)}</div>
                </div>
                <div class="scheme-col">
                    <div class="section-label">CHIT ACCOUNT &amp; SCHEME DETAILS</div>
                    <table class="meta-table">
                        <tr><td class="meta-label">Chit Invoice No:</td><td class="meta-val">${esc(d.invoiceNo)}</td></tr>
                        <tr><td class="meta-label">Scheme Name:</td><td class="meta-val">${n}-Month Festival Cracker Chit</td></tr>
                        <tr><td class="meta-label">Monthly Amount:</td><td class="meta-val">${formatRs(d.monthly)} / month</td></tr>
                        <tr><td class="meta-label">Total Scheme Value:</td><td class="meta-val">${formatRs(d.planValue)} (${n} Months)</td></tr>
                    </table>
                </div>
            </div>

            <div class="table-wrap">
                <table class="chit-table">
                    <thead>
                        <tr>
                            <th class="col-inst text-center">INST #</th>
                            <th class="col-month text-left">DUE MONTH</th>
                            <th class="col-due text-center">DUE DATE</th>
                            <th class="col-amt text-right">AMOUNT</th>
                            <th class="col-paid text-center">PAID ON / REF</th>
                            <th class="col-status text-center">STATUS</th>
                        </tr>
                    </thead>
                    <tbody>${rows}
                    </tbody>
                </table>
            </div>

            <div class="summary-grid">
                <div class="progress-box">
                    <div class="progress-title">PAYMENT PROGRESS SUMMARY</div>
                    <div class="progress-line">Completed Months : ${d.paidCount} of ${n} Installments Paid</div>
                    <div class="progress-line">Pending Months : ${n - d.paidCount} Installments Remaining</div>
                    <div class="bonus-note">* Punctual ${n}-month completion qualifies for Diwali Festival Bonus Pack!</div>
                </div>
                <div>
                    <table class="totals-table">
                        <tr><td class="totals-label">Total Chit Plan Value:</td><td class="totals-val">${formatRs(d.planValue)}</td></tr>
                        <tr><td class="totals-label">Total Amount Paid (${d.paidCount}M):</td><td class="totals-val green">${formatRs(d.paidAmount)}</td></tr>
                        <tr><td class="totals-label">Remaining Balance Due:</td><td class="totals-val red">${formatRs(d.remaining)}</td></tr>
                    </table>
                </div>
            </div>
${d.diwali ? `
            <div class="diwali-milestone">
                ${d.diwali.year} Diwali Date : ${d.diwali.month} ${d.diwali.day}<sup>${ordinal(d.diwali.day)}</sup> ${d.diwali.weekday}
            </div>` : ''}

            <div class="thank-you-banner">
                THANK YOU: Thank you for saving with A1 SIVAKASI CRACKERS! We look forward to celebrating festivals together.
            </div>

            <div class="terms-block">
                <div class="terms-title">TERMS &amp; CONDITIONS:</div>
                <ul class="terms-list">
                    <li>1. Monthly installments must be remitted on or before the 10th of every calendar month via GPay / UPI / Cash.</li>
                    <li>2. Every installment payment is recorded digitally and updated against your Chit Invoice Number.</li>
                    <li>3. Members who complete all ${n} installments consecutively are entitled to the full scheme maturity bonus &amp; cracker pack.</li>
                    <li>4. In case of discontinued scheme, settlements will be governed as per scheme rules upon conclusion of the term.</li>
                </ul>
                <div class="auto-gen-note">
                    This is a computer-generated official chit invoice copy and does not require a physical signature.
                </div>
            </div>

        </div>

        <div class="footer-bar">
            A1 SIVAKASI CRACKERS &nbsp;|&nbsp; Sivakasi, Tamil Nadu &nbsp;|&nbsp; Helpline: +91 63823 13292 / +91 90424 38994
        </div>
    </div>
</body>
</html>`;
}
