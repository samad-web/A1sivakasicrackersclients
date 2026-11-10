# Architecture

- **Frontend:** Vite + React + TS, shadcn/ui, TanStack Query. Entry `src/pages/Index.tsx` (dashboard), `src/pages/Analysis.tsx`.
- **Data:** Supabase. Tables `orders` (one row per customer per cycle) and `monthly_payments` (12 rows per order, one per cycle month).
- **Data flow:** hooks in `src/hooks/useOrders.ts` query/mutate Supabase; mutations invalidate `orders` / `order-stats` queries.
- **DB logic:** triggers and RPCs in `supabase/migrations/` (monthly row init, payment verification, rejoin score, reminders).
- **Edge functions:** `supabase/functions/` (invoice proxy, receipts).
