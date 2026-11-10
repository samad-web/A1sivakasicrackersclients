# Feature: Passbook Invoice (new invoice format)

Status: DRAFT, awaiting approval. Reference: client PDF `New_Chit_Finance_Invoice.pdf` (2026-11-10).

## Purpose
Replace the single-month receipt with a passbook-style "N-MONTH CHIT INVOICE" that shows the customer's whole plan: every installment, what is paid, what is due, and balances.

## Architecture
- Replace the layout in `src/lib/receiptTemplate.ts` (`renderReceiptHtml`), keep the same pipeline: render HTML offscreen → html2canvas → jsPDF A4 → upload to `receipts` bucket → `orders.invoice_url` → WhatsApp via `receipt-send`.
- `notifyPaymentVerified` (`src/lib/paymentWebhook.ts`) fetches all monthly rows for the order after verification (the dashboard row only has the filtered month) and builds the passbook data.
- New pure function `buildPassbook(order, monthlyPayments, today)` → rows + totals. Unit-tested.

### Field mapping
| Invoice field | Source |
|---|---|
| Chit Invoice No | `A1SC-` + `receipt_no` (pending Q3) |
| Member name / phone / address | `name`, `number` (+ `secondary_number` only if present), `customer_address` |
| Scheme name | `{N}-Month Festival Cracker Chit`, N from `type` |
| Monthly amount | `scheme` (e.g. 500) |
| Total scheme value | `value` (e.g. 6000) |
| Rows | N installments from the cycle's November; due date = 10th of each month |
| Paid On / Ref | `payment_date` + `payment_mode` |
| Status | PAID if Completed; PAY DUE for the current month unpaid; OVERDUE for past unpaid (Q4); UPCOMING otherwise |
| Totals | plan value, paid = paid count × monthly, remaining, current due |
| Diwali line | Q2 |

## Issues found in the reference PDF (to fix, not copy)
1. Unpaid "Paid On" shows `â€”`: a UTF-8 em dash decoded as Windows-1252. Render a proper `—`.
2. Row 1 says `PAID`, rows 2-5 `PAID [OK]`. Use one label.
3. Red "CURRENT DUE TO PAY" bar is missing its label (white-on-red lost).
4. Phone shows a trailing `/` when there's no secondary number.
5. "2027 Diwali Date" is hardcoded text; it will be wrong next year.

## Impact map
| Touches | Risk |
|---|---|
| `receiptTemplate.ts` | Full layout swap; old one-month receipt is gone for new sends (old PDFs stay as they are). |
| `paymentWebhook.ts` | Extra query per verification; failure must still not roll back the payment (existing best-effort rule). |
| Advance payments | Passbook naturally shows all prepaid months as PAID. |
| Storage path `orderId/month.pdf` | Unchanged; each verify writes a fresh passbook for that month. |
| `receipt-send` edge fn | Unchanged; still receives `receipt_url`. |
| 10-month schemes | Must render 10 rows and title "10-MONTH". |

## Edge cases
- Customer with no payments yet → all rows UPCOMING/PAY DUE, paid 0.
- `scheme` × N ≠ `value` (data error) → show `value` as plan total, monthly from `scheme`; log a warning.
- Long address → existing fit-to-page pass.
- Payment un-verified later → next generated passbook reflects it; old PDF not rewritten.

## Acceptance criteria
1. Verifying a payment produces a PDF matching the reference layout with the fixes above.
2. Rows = scheme length; statuses and Paid On match DB.
3. Totals: paid + remaining = plan value.
4. Advance payment of 3 months shows 3 more PAID rows in one PDF.
5. No mojibake; no trailing `/`.

## Decisions (2026-11-10)
- User: layout must be the same as the reference PDF.
- Fix only accidental defects 1, 3, 4 above. Keep `PAID` (row 1) / `PAID [OK]` (rest) as in reference.
- Invoice No = `A1SC-<receipt_no>`. Statuses only PAID / PAY DUE / UPCOMING; any due-but-unpaid month = PAY DUE.
- Diwali line for cycle 2026-27: "2027 Diwali Date : October 29th Friday".

## Open questions
- Q1: New fireworks logo file (PNG/SVG) — until provided, keep current logo.
- Q2: Diwali date source for future cycles (Settings vs. code update each year).
