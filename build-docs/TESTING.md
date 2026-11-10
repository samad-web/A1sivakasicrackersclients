# Testing

- Frontend: `npx vitest run` (jsdom, Supabase client mocked).
- DB: run files in `supabase/tests/` in the Supabase SQL editor; they roll back.

## rejoin-next-cycle
Frontend `src/components/dashboard/rejoin.test.tsx`: AC1, AC2 (page + all matching, single toggle), AC3/4/5 dialog result, AC5 row menu, AC6 prev receipt, AC7 clear on filter change, edge: RPC failure, >1000-row paging.

DB `supabase/tests/test_rejoin_orders.sql`: AC3 consecutive receipts + clean copy + 12 Empty months + old row unchanged, AC4 skip by phone, AC6 previous link, edges: already_current, not_found, second rejoin skipped. **Not yet run** (needs migration applied; no local DB by decision).

Not covered: AC8 concurrency (advisory lock) — no local DB.

Results (2026-11-10):
- Frontend: 10/10 passed. No failures found.
- Typecheck: no new errors (2 pre-existing, unrelated: `OrderFilters.tsx` VerifiedFilter, `migrate-sheets.ts`). Fixed pre-existing missing `advance_payment_verification` RPC type.
- ESLint on changed files: clean.
- DB test: pending migration apply.

## passbook-invoice
`src/lib/passbook.test.ts`: AC1 layout text, AC2 rows/statuses/10-month, AC3 totals, AC4 advance, AC5 phone + no mojibake, edges (no payments, status casing, cash ref, unknown Diwali year), security (HTML escaping).

Results (2026-11-10):
- 11/11 passed. Full suite 22/22 (rejoin regression clean).
- Visual: sample rendered in headless Chrome and compared to client PDF. Found + fixed: logo black square as watermark, header lines wrapping (switched to Arial as in the PDF).
- Not verified: real in-app PDF (html2canvas) on a live payment verify — needs a logged-in session.
