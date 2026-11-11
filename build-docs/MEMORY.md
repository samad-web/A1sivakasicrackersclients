# Project Memory

## Constraints and conventions
- Cycle = Nov 1 of year Y to Nov 1 of Y+1, decided by `orders.created_at` (`src/utils/cycle.ts`, `useOrders`).
- Archived cycles are read-only in the UI (`isReadOnly` from `isCycleArchived`).
- `initialize_monthly_payments` trigger creates 12 `Empty` monthly rows on order insert.
- `receipt_no` is not unique alone; DB unique key is `(receipt_no, current_month, name, number)`.
- No Docker in this project (user decision 2026-11-10). SQL tests in `supabase/tests/` run in the Supabase SQL editor and roll back.
- Dev server: `npm run dev` → http://localhost:8080 (first start re-optimizes deps, can be slow).

## Decisions
- 2026-11-10: Rejoin = new order row (copy), not moving the old one. Keeps past-cycle history and stats intact.
- 2026-11-10: Rejoined orders get the next receipt number in the active cycle (DB function, advisory lock). Old receipt + cycle stored on the new row and shown in the table.
- 2026-11-10: Bulk rejoin skips customers whose phone is already in the active cycle and reports them.
- 2026-11-10: Select all = page, then "all N matching" across pages.

- 2026-11-10: Invoice = client's passbook format, exactly as their PDF; app logo reused; Arial to match PDF. Diwali dates kept in code (`DIWALI` in `passbook.ts`), update yearly.
- 2026-11-10: WhatsApp provider KWIC → WASI (https://wasi.sirahagents.com, `POST /api/v1/messages`, `Authorization: Bearer`, positional params). KWIC failures were template/variable-key mismatch; KWIC discontinued by user. Templates (approved in WASI): `payment_receipt_link` {{1}} receipt_no {{2}} scheme {{3}} PDF url; `payment_reminder` {{1}} month {{2}} name {{3}} amount. Only required Supabase secret: `WASI_API_KEY`; base/client_id/template names default in code. DB columns `kwic_message_id/kwic_response` kept (now hold WASI ids) to avoid a migration.
- 2026-11-11: Client rule: October = free Diwali bonus month. Invoice marks it PAID ("Diwali Offer") and counts it in totals. Invoice-only; DB rows untouched.
- WASI key lives in Supabase secrets; `.env` is git-tracked (legacy) so never commit the `WASI_API` line.

## Open questions / known issues
- Orders with empty `value` show "Total Chit Plan Value Rs. 0.00" and Balance 0 on the invoice (seen 2026-11-11). Fix offered (use monthly × term); user deferred.
- "Add Record" saves `current_month` as a month name (e.g. `November`), but `invoice-proxy` expects `YYYY-MM`. Pre-existing; not fixed here.
