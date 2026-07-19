-- Reminder engine: queue tables + worker RPCs + admin gate.
--
-- Frontend trigger (reminders-start edge fn) enqueues one reminder_messages row per
-- unpaid customer under a reminder_runs row; a cron-driven worker (reminders-worker)
-- drains the queue via KWIC. Mirrors the monthly_reset_logs idempotency pattern.
--
-- RLS is enabled on THESE NEW tables only (nothing else reads them, so this is safe and
-- keeps the queue + admin emails non-public). Locking down orders/monthly_payments is a
-- separate, tested follow-up migration.

-- ---------------------------------------------------------------------------
-- admins: who may trigger a run. Seeded during deploy with the owner's email.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admins (
    email      TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- reminder_runs: one row per triggered send.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reminder_runs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    month_name    TEXT NOT NULL,
    cycle_year    INT,
    is_test       BOOLEAN NOT NULL DEFAULT FALSE,
    status        TEXT NOT NULL DEFAULT 'running',   -- running|completed|failed|canceled
    total_count   INT NOT NULL DEFAULT 0,
    sent_count    INT NOT NULL DEFAULT 0,
    failed_count  INT NOT NULL DEFAULT 0,
    skipped_count INT NOT NULL DEFAULT 0,
    triggered_by  TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at  TIMESTAMPTZ
);

-- Run lock: at most one non-test run in 'running' per month. A concurrent/double-click
-- start for the same month fails the insert instead of enqueuing twice.
CREATE UNIQUE INDEX IF NOT EXISTS reminder_runs_one_active
    ON public.reminder_runs (month_name)
    WHERE status = 'running' AND is_test = FALSE;

-- ---------------------------------------------------------------------------
-- reminder_messages: one row per recipient. Keyed by order_id (receipt_no is NOT unique).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reminder_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id          UUID NOT NULL REFERENCES public.reminder_runs (id) ON DELETE CASCADE,
    order_id        UUID REFERENCES public.orders (id),
    receipt_no      TEXT,
    name            TEXT,
    phone           TEXT,                              -- already 91-prefixed
    amount          TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',   -- pending|processing|sent|failed|skipped
    skip_reason     TEXT,
    kwic_message_id TEXT,
    kwic_response   JSONB,
    error           TEXT,
    attempts        INT NOT NULL DEFAULT 0,
    sent_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No double-enqueue of the same order within a run (test rows have order_id NULL, so the
-- partial index skips them).
CREATE UNIQUE INDEX IF NOT EXISTS reminder_messages_run_order
    ON public.reminder_messages (run_id, order_id)
    WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS reminder_messages_run_status
    ON public.reminder_messages (run_id, status);

-- ---------------------------------------------------------------------------
-- is_admin(): true when the caller's JWT email is in admins. SECURITY DEFINER so it
-- reads admins regardless of RLS. Used by the frontend to show/hide the trigger.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admins
        WHERE email = (auth.jwt() ->> 'email')
    );
$$;

-- ---------------------------------------------------------------------------
-- claim_reminder_batch(): atomically move up to p_limit pending rows of a run to
-- 'processing' and return them. FOR UPDATE SKIP LOCKED so overlapping worker ticks never
-- grab the same rows. Service-role only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_reminder_batch(p_run_id UUID, p_limit INT)
RETURNS SETOF public.reminder_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    UPDATE public.reminder_messages m
    SET status = 'processing', updated_at = now()
    WHERE m.id IN (
        SELECT id FROM public.reminder_messages
        WHERE run_id = p_run_id AND status = 'pending'
        ORDER BY created_at
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
    )
    RETURNING m.*;
END;
$$;

-- ---------------------------------------------------------------------------
-- reclaim_stuck_messages(): reset rows stuck in 'processing' (a worker died mid-batch)
-- back to 'pending' so the next tick retries them. Service-role only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reclaim_stuck_messages(p_older_than INTERVAL)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INT;
BEGIN
    UPDATE public.reminder_messages
    SET status = 'pending', updated_at = now()
    WHERE status = 'processing' AND updated_at < now() - p_older_than;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS + grants (new tables only).
-- ---------------------------------------------------------------------------
ALTER TABLE public.admins            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_runs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_messages ENABLE ROW LEVEL SECURITY;

-- A user may see only their own admin row; the full list stays private.
CREATE POLICY admins_self_select ON public.admins
    FOR SELECT TO authenticated
    USING (email = (auth.jwt() ->> 'email'));

-- Logged-in users may read run progress; writes happen only via the service role
-- (which bypasses RLS). No anon access.
CREATE POLICY reminder_runs_auth_select ON public.reminder_runs
    FOR SELECT TO authenticated USING (true);
CREATE POLICY reminder_messages_auth_select ON public.reminder_messages
    FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.reminder_runs, public.reminder_messages TO authenticated;
GRANT SELECT ON public.admins TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.claim_reminder_batch(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reclaim_stuck_messages(INTERVAL) TO service_role;
