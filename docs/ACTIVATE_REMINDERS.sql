-- ============================================================================
-- ACTIVATE REMINDERS — paste this whole file into the Supabase SQL Editor
-- Project: fozdckbsznvncwkzjqsb  (Dashboard -> SQL Editor -> New query -> paste -> Run)
--
-- Safe to run more than once (idempotent). This does STEP 1 + STEP 2 of the fix:
--   1. Creates the missing enqueue_reminder_run() function + the 9AM cron schedule
--   2. Seeds the admin allowlist so the "Send" button works
--   3. Makes sure pg_cron / pg_net extensions are on
--
-- >>> BEFORE RUNNING: replace OWNER_EMAIL_HERE on the last line with your login email. <<<
-- ============================================================================

-- --- extensions the cron paths need ----------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net   WITH SCHEMA extensions;

-- --- enqueue_reminder_run(): the scheduled-run entry point (was never applied) ---
CREATE OR REPLACE FUNCTION public.enqueue_reminder_run(
    p_month_name   TEXT DEFAULT NULL,   -- defaults to the current month (IST)
    p_cycle_year   INT  DEFAULT NULL,   -- defaults to the active cycle (starts in November)
    p_triggered_by TEXT DEFAULT 'cron'
)
RETURNS UUID                            -- the new run id, or NULL when skipped
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ist     TIMESTAMP := now() AT TIME ZONE 'Asia/Kolkata';
    v_month   TEXT;
    v_cycle   INT;
    v_start   TIMESTAMPTZ;
    v_end     TIMESTAMPTZ;
    v_run_id  UUID;
    v_total   INT;
    v_skipped INT;
BEGIN
    v_month := COALESCE(p_month_name, btrim(to_char(v_ist, 'Month')));
    v_cycle := COALESCE(
        p_cycle_year,
        CASE WHEN EXTRACT(MONTH FROM v_ist) >= 11
             THEN EXTRACT(YEAR FROM v_ist)::INT
             ELSE EXTRACT(YEAR FROM v_ist)::INT - 1
        END);

    v_start := make_timestamptz(v_cycle,     11, 1, 0, 0, 0, 'UTC');
    v_end   := make_timestamptz(v_cycle + 1, 10, 1, 0, 0, 0, 'UTC');

    BEGIN
        INSERT INTO public.reminder_runs (month_name, cycle_year, is_test, status, triggered_by)
        VALUES (v_month, v_cycle, FALSE, 'running', p_triggered_by)
        RETURNING id INTO v_run_id;
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'reminder run for % already active — skipped', v_month;
        RETURN NULL;
    END;

    WITH candidate AS (
        SELECT o.id,
               o.receipt_no,
               btrim(COALESCE(o.name, ''))                          AS name,
               regexp_replace(COALESCE(o.number, ''), '\D', '', 'g') AS digits,
               o.scheme
        FROM public.orders o
        JOIN public.monthly_payments p ON p.order_id = o.id
        WHERE p.month_name = v_month
          AND p.payment_status <> 'Completed'
          AND o.created_at >= v_start
          AND o.created_at <  v_end
    ), normalised AS (
        SELECT id, receipt_no, name, scheme,
               CASE
                   WHEN length(digits) = 10                          THEN '91' || digits
                   WHEN length(digits) = 12 AND digits LIKE '91%'    THEN digits
                   WHEN length(digits) = 11 AND digits LIKE '0%'     THEN '91' || substr(digits, 2)
               END AS phone,
               CASE WHEN scheme ~ '^\s*[0-9]+(\.[0-9]+)?\s*$'
                    THEN btrim(scheme)::NUMERIC
               END AS amount_num
        FROM candidate
    )
    INSERT INTO public.reminder_messages
        (run_id, order_id, receipt_no, name, phone, amount, status, skip_reason)
    SELECT v_run_id, id, receipt_no, name, phone, COALESCE(scheme, ''),
           CASE WHEN name = '' OR phone IS NULL OR COALESCE(amount_num, 0) <= 0
                THEN 'skipped' ELSE 'pending' END,
           CASE WHEN name = ''                        THEN 'missing name'
                WHEN phone IS NULL                    THEN 'invalid phone'
                WHEN COALESCE(amount_num, 0) <= 0     THEN 'invalid amount'
           END
    FROM normalised
    ON CONFLICT (run_id, order_id) DO NOTHING;

    SELECT count(*), count(*) FILTER (WHERE status = 'skipped')
      INTO v_total, v_skipped
      FROM public.reminder_messages
     WHERE run_id = v_run_id;

    UPDATE public.reminder_runs
       SET total_count   = v_total,
           skipped_count = v_skipped,
           status        = CASE WHEN v_total - v_skipped = 0 THEN 'completed' ELSE 'running' END,
           completed_at  = CASE WHEN v_total - v_skipped = 0 THEN now() END,
           updated_at    = now()
     WHERE id = v_run_id;

    RETURN v_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_reminder_run(TEXT, INT, TEXT) FROM PUBLIC, anon, authenticated;

-- --- the 9AM enqueue schedule (idempotent: drop any prior job of this name first) ---
DO $$
BEGIN
    PERFORM cron.unschedule('reminders-enqueue');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
    'reminders-enqueue',
    '30 3 1,3,5,7,9 * *',   -- 09:00 IST on days 1,3,5,7,9
    $$ SELECT public.enqueue_reminder_run() $$
);

-- --- STEP 2: seed the admin so the manual "Send" button works ---------------
-- >>> REPLACE the email below with your actual login email before running. <<<
INSERT INTO public.admins (email) VALUES ('OWNER_EMAIL_HERE')
ON CONFLICT DO NOTHING;

-- --- Verify (these SELECTs should show the function, the job, and your admin) ---
SELECT 'enqueue_reminder_run exists' AS check,
       EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enqueue_reminder_run') AS ok;
SELECT jobname, schedule FROM cron.job WHERE jobname IN ('reminders-enqueue','reminders-worker');
SELECT email FROM public.admins;
