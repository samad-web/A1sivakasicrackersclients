# Feature: Rejoin Next Cycle

## Purpose
Customers from an archived cycle want to join the active cycle. Today staff must retype every field via "Add Record". This lets staff pick one or many past customers and add them to the active cycle with a new receipt number, keeping a visible link to their old receipt.

## Decisions (approved 2026-11-10)
- New orders get a **new receipt number** (next number in the active cycle). Old receipt no + old cycle are shown on the new row.
- Customers whose phone already exists in the active cycle are **skipped and reported**.
- Select all = current page, then "Select all N matching" across pages.

## Architecture
### DB (`supabase/migrations/20261110000000_rejoin_orders.sql`)
- New nullable columns on `orders`: `previous_order_id` (FK → orders, `ON DELETE SET NULL`), `previous_receipt_no`, `previous_cycle_year`. Denormalized receipt/cycle so the dashboard can show them via the existing `select('*')` with no join (old rows are read-only, so no drift).
- RPC `rejoin_orders(p_order_ids uuid[])`, one transaction:
  - `pg_advisory_xact_lock` so two staff rejoining at once can't get the same receipt number.
  - Active cycle = Nov 1 → Nov 1, IST (same rule as `compute_rejoin_score`).
  - Next receipt = max numeric `receipt_no` in active cycle + 1 (non-numeric receipts ignored).
  - Processes ids in the given order (table order) so numbers follow the old list.
  - Skips: `not_found`, `already_current` (source is in active cycle), `already_in_cycle` (phone already in active cycle, not counting rows added by this same call).
  - Copies receipt-independent fields; sets `current_month` = today `YYYY-MM`; leaves flags/invoice/score at defaults.
  - Returns one row per input: source id, name, old receipt, new id, new receipt, skip reason, existing receipt.
  - `SECURITY INVOKER`: runs under the caller's RLS, same rights as "Add Record".
- Existing trigger `initialize_monthly_payments` creates the 12 `Empty` months.

### Frontend
- `OrdersTable.tsx`: on archived cycles only, a checkbox column (desktop) / checkbox on cards (mobile), header select-all for the page, "Select all N matching" banner, sticky action bar. Selection clears when month/cycle/search/filters change.
- `OrderActions.tsx`: row menu "Add to Current Cycle" (archived only) → same dialog with one id.
- `RejoinDialog.tsx`: confirm → call RPC → result summary (added count, receipt range, skipped list).
- `useOrders.ts`: `useRejoinOrders` mutation; `fetchMatchingOrderIds(filters)` reuses the same filter builder as `useOrders`, pages through 1000-row limit.
- Receipt cell shows `Prev #266 · Cycle 2025-26` when `previous_receipt_no` is set.

## Impact map
| Touches | Risk |
|---|---|
| `orders` table (3 new nullable cols) | Additive. `select('*')` picks them up; old frontend ignores them. |
| Unique key `(receipt_no, current_month, name, number)` | New receipt + new month → no collision with old row. Any error aborts whole batch (atomic). |
| Manual "Add Record" | Can still type a receipt that a rejoin later also assigns; lock only serializes rejoins. Low risk, documented. |
| `useOrders` query builder | Refactored into a shared function; dashboard list must return identical results. |
| `OrdersTable.tsx` desktop + mobile | Checkbox column only when archived; `colSpan` of empty state must match. |
| `OrderActions.tsx` | Edit/Delete stay disabled on archived rows. |
| Rejoin score trigger, reminders, receipts, Analysis | New rows behave like any new order. Old cycle untouched. |

## Edge cases
- 0 selected → bar hidden. All skipped → result shows 0 added.
- Same customer selected twice (two schemes, two old orders) → both added (second not skipped: batch rows excluded from phone check).
- Clicking rejoin twice → second time all skipped (`already_in_cycle`).
- Network/DB error → nothing inserted, toast, selection kept.
- >1000 matching → id fetch pages through.
- Migration not applied → RPC call fails with a toast; dashboard keeps working.

## Acceptance criteria
1. Archived cycle: checkbox column + header select-all visible; active cycle: hidden.
2. Header checkbox selects every row on the page; "Select all N matching" selects across pages.
3. Rejoin creates one active-cycle order per selected customer with the next receipt numbers, 12 months `Empty`; old orders unchanged.
4. Phone already in active cycle → skipped and listed.
5. Row menu "Add to Current Cycle" does the same for one customer.
6. New row shows old receipt + old cycle.
7. Selection clears on month/cycle/filter/search change.
8. Concurrent calls never assign the same receipt number.
