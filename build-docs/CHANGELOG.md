# Changelog

## feat(passbook-invoice): remove "Current Due to Pay" (2026-11-11)
- Client request: red CURRENT DUE TO PAY row and `currentDue` field removed from the invoice.

## feat(passbook-invoice): October bonus month (2026-11-11)
- Invoice shows October as PAID with "Diwali Offer", counted in Total Paid / Balance. Frontend only → ships with Vercel deploy.

## fix(whatsapp): KWIC → WASI (2026-11-10)
- `receipt-send` and `reminders-worker` now send via WASI templates `payment_receipt_link` / `payment_reminder`.
- Error toast shows WASI's `error.message`. Missing receipt URL → placeholder text (Meta rejects empty params).
- **Deploy:** set secret `WASI_API_KEY`, redeploy both functions. `docs/RECEIPT_DEPLOY.md`, `docs/REMINDERS_DEPLOY.md`, `scripts/send-*.mjs` still describe KWIC (stale).

## fix(dashboard-layout) (2026-11-10)
- Orders table: fixed column widths (`table-fixed`), address wraps; no sideways scroll, Actions always visible. Desktop table from `xl` (1280px), cards below.
- Header: actions in no-wrap groups so Logout never wraps alone; Refresh icon-only; title no-wrap.

## passbook-invoice (2026-11-10)
- Receipts are now the client's passbook-style "N-MONTH CHIT INVOICE": all installments, paid-on dates, statuses, totals, Diwali line.
- `buildPassbook` reads all monthly rows fresh on each verify. Old one-month template removed.
- Fixed vs reference: broken dash, missing due-bar label, trailing `/` on phone.
- **Yearly:** add next year's Diwali date to `DIWALI` in `src/lib/passbook.ts`.

## rejoin-next-cycle (2026-11-10)
- Archived cycles: checkbox select, select-all (page + all matching), "Add to Current Cycle" bulk action and row-menu action.
- DB: `rejoin_orders` RPC (new receipt numbers, skip duplicates by phone, atomic, advisory lock); `orders.previous_order_id / previous_receipt_no / previous_cycle_year`.
- Table shows `Prev #<receipt> · Cycle <yy>` on rejoined orders.
- Refactor: `useOrders` filter builder shared with select-all-matching.
- Types: registered `rejoin_orders` and `advance_payment_verification` RPCs.
- **Deploy:** apply `supabase/migrations/20261110000000_rejoin_orders.sql` in Supabase before using the button.
