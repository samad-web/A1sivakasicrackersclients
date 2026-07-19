# Payment-Reminder Engine — Deploy Runbook

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
