# Changelog

## rejoin-next-cycle (2026-11-10)
- Archived cycles: checkbox select, select-all (page + all matching), "Add to Current Cycle" bulk action and row-menu action.
- DB: `rejoin_orders` RPC (new receipt numbers, skip duplicates by phone, atomic, advisory lock); `orders.previous_order_id / previous_receipt_no / previous_cycle_year`.
- Table shows `Prev #<receipt> · Cycle <yy>` on rejoined orders.
- Refactor: `useOrders` filter builder shared with select-all-matching.
- Types: registered `rejoin_orders` and `advance_payment_verification` RPCs.
- **Deploy:** apply `supabase/migrations/20261110000000_rejoin_orders.sql` in Supabase before using the button.
