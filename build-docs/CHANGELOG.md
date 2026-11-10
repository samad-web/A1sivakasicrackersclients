# Changelog

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
