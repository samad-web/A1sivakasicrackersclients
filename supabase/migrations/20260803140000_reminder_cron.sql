-- Scheduled reminders: enqueue a run from pg_cron instead of an admin clicking the button.
--
-- Enqueuing is pure DB work (query the unpaid, insert queue rows), so this mirrors the
-- reminders-start edge function in SQL rather than making cron call an HTTP endpoint that
-- expects an admin JWT. The existing reminders-worker still does all the sending, so pacing,
-- retries and the three-way KWIC outcome handling are unchanged.
--
-- Recipients are recomputed at each run, so anyone who has paid since the last one — or who
-- paid several months ahead via advance_payment_verification, which marks every prepaid
-- month 'Completed' — is silently dropped.

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
    -- 'Month' pads to 9 chars; btrim gives the bare English name the rest of the app uses.
    v_month := COALESCE(p_month_name, btrim(to_char(v_ist, 'Month')));
    v_cycle := COALESCE(
        p_cycle_year,
        CASE WHEN EXTRACT(MONTH FROM v_ist) >= 11
             THEN EXTRACT(YEAR FROM v_ist)::INT
             ELSE EXTRACT(YEAR FROM v_ist)::INT - 1
        END);

    -- Cycle window, matching reminders-start: Nov 1 of the cycle year to Oct 1 of the next.
    v_start := make_timestamptz(v_cycle,     11, 1, 0, 0, 0, 'UTC');
    v_end   := make_timestamptz(v_cycle + 1, 10, 1, 0, 0, 0, 'UTC');

    BEGIN
        INSERT INTO public.reminder_runs (month_name, cycle_year, is_test, status, triggered_by)
        VALUES (v_month, v_cycle, FALSE, 'running', p_triggered_by)
        RETURNING id INTO v_run_id;
    EXCEPTION WHEN unique_violation THEN
        -- reminder_runs_one_active: a run for this month is still draining. Skip this tick
        -- rather than queue the same people twice.
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
               -- Bare 10 digits in the DB; KWIC wants 91-prefixed. NULL = unusable, e.g. a
               -- US number, which must be skipped rather than misrouted.
               CASE
                   WHEN length(digits) = 10                          THEN '91' || digits
                   WHEN length(digits) = 12 AND digits LIKE '91%'    THEN digits
                   WHEN length(digits) = 11 AND digits LIKE '0%'     THEN '91' || substr(digits, 2)
               END AS phone,
               -- CASE short-circuits, so a non-numeric scheme never reaches the cast.
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

    -- Nothing sendable (e.g. everyone has paid) completes the run immediately, so it never
    -- holds the month's run-lock against the next scheduled tick.
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

-- 09:00 IST = 03:30 UTC. Days 1,3,5,7,9 — the first ten days, every other day.
-- pg_cron reads the server timezone, which is UTC on Supabase; confirm with `show timezone`.
SELECT cron.schedule(
    'reminders-enqueue',
    '30 3 1,3,5,7,9 * *',
    $$ SELECT public.enqueue_reminder_run() $$
);
