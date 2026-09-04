# Payment-Reminder Engine — Deploy Runbook

## 🐛 BUG FIX (2026-09-03) — scheduled enqueue crashed every run

After activation, the `reminders-enqueue` cron **failed on every scheduled run** (Sept 1 and
Sept 3 both errored at 09:00 IST) with:

```
ERROR: there is no unique or exclusion constraint matching the ON CONFLICT
```

**Cause:** `enqueue_reminder_run()` ends its insert with `ON CONFLICT (run_id, order_id)`, but
the unique index `reminder_messages_run_order` is **partial** (`WHERE order_id IS NOT NULL`).
Postgres only uses a partial unique index for `ON CONFLICT` when the clause repeats that
predicate. Without it the whole insert aborts, so no run was created and nothing sent.

**Fix:** changed the clause to `ON CONFLICT (run_id, order_id) WHERE order_id IS NOT NULL
DO NOTHING` (in `supabase/migrations/20260803140000_reminder_cron.sql`). Applied live via
`CREATE OR REPLACE FUNCTION`, then **verified through the real pg_cron path** (a one-off
`cron.schedule` test ran the function and returned `succeeded`), confirming future 9 AM runs
work. No customer messages were sent during diagnosis.

## 🚑 ACTIVATION FIX (2026-09-01) — reminders not sending, read this first

Diagnosed against the **live** DB `fozdckbsznvncwkzjqsb` by probing REST + functions. Verified state:

| Check | Result | Meaning |
|---|---|---|
| `reminder_runs` / `reminder_messages` rows | **0, ever** | No reminder has ever been queued — not even a test |
| `reminders-start-` function (note trailing hyphen) | **deployed** (401 to anon) | Manual "Send" path is live and healthy |
| `reminders-worker` function | **deployed** (401 to anon) | Worker is live |
| `enqueue_reminder_run` RPC | **MISSING** (PGRST202) | Cron migration `20260803140000_reminder_cron.sql` was **never applied** → scheduled runs never fire |
| `is_admin` RPC | returns `false` | `admins` allowlist likely **empty** → the "Send" button 403s before creating a run |
| `orders` / `monthly_payments` via anon key | **readable** | RLS still not enabled (separate security follow-up) |

**Root cause:** engine partially activated. First migration + both functions reached the live DB,
but (a) the **cron migration was never applied**, and (b) **no admin was seeded**, so neither the
manual nor the scheduled path could ever create a run. `config.toml` also pointed at the wrong
project ref (`eojfokocbecrfcmpfpdf`) — **fixed in code** so future deploys target the real DB.

**Minimal fix (owner access required — cannot be done from the repo):**

1. **Apply the missing cron migration** to `fozdckbsznvncwkzjqsb`:
   ```
   supabase db push        # config.toml now points at the right project
   ```
   (The cron migration is now idempotent — safe to re-run.)
2. **Seed the admin** (Studio → SQL editor):
   ```sql
   insert into public.admins (email) values ('OWNER_EMAIL_HERE')
   on conflict do nothing;
   ```
   The admin must also exist as an Auth user (Authentication → Add user) to log in.
3. **Confirm function secrets exist on THIS project** — `KWIC_BASE_URL`, `KWIC_API_KEY`,
   `KWIC_TEMPLATE_ID`, `CRON_SECRET`, `MSGS_PER_MIN`, `MAX_ATTEMPTS` (see step 4 below).
   If they were set on the old `eojfokocbecrfcmpfpdf` project, they must be re-set here.
4. **Confirm the worker cron is scheduled here** and its `x-cron-secret` header value **exactly**
   equals `CRON_SECRET` (a trailing newline/space silently 401s every tick — see step 6 below).
5. **Verify the KWIC template** `payment_reminder`'s variable placeholder names match the keys
   hardcoded in `reminders-worker/index.ts` (`"July"`, `"DavidYash"`, `"500"`).
6. **Test:** log in as the seeded admin → Reminders → send a test to your own number → confirm it
   **arrives on the handset** (a `message_id` = accepted by KWIC, NOT delivered — needs Meta
   billing on the WhatsApp Business account).

Everything below is the original full runbook for reference.

---

In-app WhatsApp payment reminders. An admin clicks **Reminders** in the dashboard header;
an edge function enqueues everyone unpaid for the month; a cron-driven worker drains the
queue via KWIC, paced to protect the WhatsApp quality rating.

**None of this is live until the steps below are run** — the code is written, but it must
be deployed against the correct Supabase project by someone with owner access.

## Components

| Piece | Path |
|---|---|
| DB migration (tables, RPCs, admins) | `supabase/migrations/20260719120000_reminder_engine.sql` |
| Enqueue function | `supabase/functions/reminders-start/index.ts` |
| Worker (cron) | `supabase/functions/reminders-worker/index.ts` |
| Login + auth gate | `src/contexts/AuthProvider.tsx`, `src/pages/Login.tsx`, `src/components/RequireAuth.tsx`, `src/App.tsx` |
| Trigger + progress UI | `src/components/dashboard/SendRemindersDialog.tsx` (in `src/pages/Index.tsx` header) |

## ⚠️ Project-ref mismatch — read first

`supabase/config.toml` says `project_id = "eojfokocbecrfcmpfpdf"`, but the app's real DB is
**`fozdckbsznvncwkzjqsb`** (see `.env` `VITE_SUPABASE_URL`). Deploy against the **real**
one, or you will migrate/deploy to the wrong database. Either fix `config.toml` or pass
`--project-ref fozdckbsznvncwkzjqsb` explicitly on every command.

## Deploy steps (order matters)

**Create the admin user BEFORE the login gate ships, or the app locks everyone out.**

1. **Link the right project**
   ```
   supabase link --project-ref fozdckbsznvncwkzjqsb
   ```
2. **Apply the migration**
   ```
   supabase db push
   ```
3. **Create the admin + seed the allowlist** — in Supabase Studio → Authentication → Add
   user (email + password). Then in the SQL editor:
   ```sql
   insert into public.admins (email) values ('OWNER_EMAIL_HERE');
   ```
4. **Set function secrets** (the KWIC key never touches the frontend)
   ```
   supabase secrets set \
     KWIC_BASE_URL=https://app.kwic.in/ \
     KWIC_API_KEY=<your KWIC api key> \
     KWIC_TEMPLATE_ID=payment_reminder \
     CRON_SECRET=<a long random string> \
     MSGS_PER_MIN=12 \
     MAX_ATTEMPTS=3
   ```
   (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.)
5. **Deploy the functions**
   ```
   supabase functions deploy reminders-start reminders-worker
   ```
6. **Schedule the worker** — enable `pg_cron` + `pg_net` (Studio → Database → Extensions),
   then in the SQL editor (use the SAME `CRON_SECRET` as step 4):
   ```sql
   select cron.schedule(
     'reminders-worker', '* * * * *',
     $$ select net.http_post(
          url     := 'https://fozdckbsznvncwkzjqsb.functions.supabase.co/reminders-worker',
          headers := jsonb_build_object('x-cron-secret','<CRON_SECRET>','Content-Type','application/json')
        ) $$
   );
   ```
7. **Ship the frontend** — build and deploy as usual. Confirm you can log in, then that the
   admin sees the **Reminders** button.

## Using it

1. Open **Reminders** → send a **test** to your own number first. Confirm a real message
   **arrives on the handset** — a `message_id` alone does NOT mean delivered (it needs Meta
   billing, which is separately configured on the WhatsApp Business account).
2. Type **SEND** to trigger the real run. Watch the progress bar; it drains in the
   background (safe to close). Re-clicking while a run is active is blocked (409).

## Tuning throughput (the 600 case)

Throughput is one secret, `MSGS_PER_MIN`. Drain time ≈ `count / MSGS_PER_MIN` minutes:

| MSGS_PER_MIN | 126 msgs | 600 msgs |
|---|---|---|
| 6  | ~21 min | ~100 min |
| 12 | ~11 min | ~50 min |
| 30 | ~4 min  | ~20 min |

Raising it is a one-line `supabase secrets set MSGS_PER_MIN=…` — no redeploy. **But confirm
two external limits before a 600-run:**
1. **KWIC's rate limit** — ask KWIC their allowed msgs/min and keep `MSGS_PER_MIN` under it.
   The worker already backs off on HTTP 429 / 5xx and retries up to `MAX_ATTEMPTS`.
2. **WhatsApp 24h tier** — Meta caps unique business-initiated recipients per rolling 24h
   by tier (250 → 1k → 10k…). On the 250 tier a 600-run starts failing after 250 (Meta
   rejects, not a bug). Check the tier in Meta Business Manager; if under 600, request a
   bump or split the run across two days.

## Operational notes

- **Idempotency:** at most one non-test run per month can be `running` (partial unique
  index). A dead worker's `processing` rows are auto-reclaimed after 5 min.
- **Recipients** = orders in the active cycle whose `monthly_payments` row for the month is
  `<> 'Completed'`. Keyed by `order_id` (receipt_no is NOT unique). Phones are stored as
  bare 10 digits and get `91` prefixed; non-10-digit numbers are skipped, not misrouted.
- **A stuck run** (worker never ran) can be cleared manually:
  `update public.reminder_runs set status='canceled' where id='…';`
- **Per-message audit:** every send's KWIC response (incl. `message_id`) is stored on
  `public.reminder_messages`, so failures are inspectable.

## Follow-up (not in this change): RLS lockdown

Auth currently gates the **UI**. The public repo's anon key can still read customer data
directly until row-level security is enabled on `orders` / `monthly_payments`. That is a
separate, carefully-tested migration (a wrong policy locks out the live app) — do it on a
preview branch and verify every read path while logged in before relying on it.
