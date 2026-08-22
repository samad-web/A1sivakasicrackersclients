-- Rejoin Likelihood Score
-- =========================
-- Adds a per-customer Rejoin Score (0-100) + tier ('High'/'Medium'/'Low') to
-- public.orders, computed from payment reliability in monthly_payments.
--
-- Scoring basis: RELIABILITY VS ELAPSED MONTHS (chosen by the business).
-- We score against the installments that have actually come DUE so far in the
-- order's cycle, not the full 10/12-month term -- so a customer who has paid
-- every due month is scored high even mid-cycle, and future (not-yet-due)
-- months are ignored until they arrive.
--
-- Formula (mirrors the analytics dashboard):
--   score = due_completion_ratio*60 + streak_ratio*25 + consistency_bonus(10)
--   tier  = High  (score >= 55)
--           Medium(score >= 30)
--           Low   (else)
-- Tier cutoffs are set on the elapsed-month scale (a fully-reliable payer lands
-- near 95-100, a half-reliable payer near 40-50).
--
-- Safe / non-destructive: only ADDS columns + functions + a trigger, then
-- backfills the two new columns. No existing data is modified or removed.

BEGIN;

-- 1. Columns -----------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS rejoin_score INT,
  ADD COLUMN IF NOT EXISTS rejoin_tier  TEXT;

-- 2. Cycle month order helper ------------------------------------------------
-- The cycle runs November (position 1) .. September (position 11 for 12-month,
-- capped at 10 for 10-month schemes). This maps a month_name to its 1-based
-- position within the cycle.
CREATE OR REPLACE FUNCTION public.cycle_month_position(p_month_name TEXT)
RETURNS INT AS $$
  SELECT CASE btrim(lower(p_month_name))
    WHEN 'november'  THEN 1
    WHEN 'december'  THEN 2
    WHEN 'january'   THEN 3
    WHEN 'february'  THEN 4
    WHEN 'febraury'  THEN 4   -- tolerate the misspelling present in source data
    WHEN 'march'     THEN 5
    WHEN 'april'     THEN 6
    WHEN 'may'       THEN 7
    WHEN 'june'      THEN 8
    WHEN 'july'      THEN 9
    WHEN 'august'    THEN 10
    WHEN 'september' THEN 11
    ELSE NULL
  END;
$$ LANGUAGE sql IMMUTABLE;

-- 3. Elapsed months in a cycle ----------------------------------------------
-- Given the cycle start year (cycle begins Nov of that year), how many cycle
-- positions have come due as of now() in IST. Clamped to [1, term].
CREATE OR REPLACE FUNCTION public.cycle_elapsed_positions(p_cycle_year INT, p_term INT)
RETURNS INT AS $$
DECLARE
  v_now DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_start DATE := make_date(p_cycle_year, 11, 1);   -- Nov 1 of cycle year
  v_months INT;
BEGIN
  v_months := (date_part('year', v_now) - date_part('year', v_start)) * 12
            + (date_part('month', v_now) - date_part('month', v_start)) + 1;
  IF v_months < 1 THEN v_months := 1; END IF;
  IF v_months > p_term THEN v_months := p_term; END IF;
  RETURN v_months;
END;
$$ LANGUAGE plpgsql STABLE;

-- 4. Core scorer -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_rejoin_score(p_order_id UUID)
RETURNS TABLE(score INT, tier TEXT) AS $$
DECLARE
  v_type        TEXT;
  v_created     TIMESTAMPTZ;
  v_term        INT;
  v_cycle_year  INT;
  v_elapsed     INT;
  v_paid_due    INT;   -- completed installments among due months
  v_streak      INT;   -- consecutive completed from cycle start
  v_ratio       NUMERIC;
  v_streak_r    NUMERIC;
  v_score       NUMERIC;
  v_tier        TEXT;
BEGIN
  SELECT o.type, o.created_at INTO v_type, v_created
  FROM public.orders o WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::INT, NULL::TEXT; RETURN;
  END IF;

  -- term: 12 if the type mentions 12, else 10
  v_term := CASE WHEN v_type ILIKE '%12%' THEN 12 ELSE 10 END;

  -- cycle year: cycle starts in Nov; an order created Jan-Oct belongs to the
  -- prior year's cycle.
  v_cycle_year := CASE
    WHEN date_part('month', v_created) >= 11
      THEN date_part('year', v_created)::INT
    ELSE date_part('year', v_created)::INT - 1
  END;

  v_elapsed := public.cycle_elapsed_positions(v_cycle_year, v_term);

  -- completed installments among the months that have come due.
  -- NOTE: payment_status is compared with btrim()+lower() because the imported
  -- data contains values like 'Completed ' (trailing space) and mixed casing.
  SELECT count(*) INTO v_paid_due
  FROM public.monthly_payments mp
  WHERE mp.order_id = p_order_id
    AND lower(btrim(mp.payment_status)) = 'completed'
    AND public.cycle_month_position(mp.month_name) IS NOT NULL
    AND public.cycle_month_position(mp.month_name) <= v_elapsed;

  -- consecutive completed streak from the first due cycle position
  WITH due AS (
    SELECT gs AS pos,
           EXISTS (
             SELECT 1 FROM public.monthly_payments mp
             WHERE mp.order_id = p_order_id
               AND lower(btrim(mp.payment_status)) = 'completed'
               AND public.cycle_month_position(mp.month_name) = gs
           ) AS paid
    FROM generate_series(1, v_elapsed) gs
  ),
  run AS (
    -- length of the leading run of paid=true
    SELECT count(*) AS streak
    FROM due
    WHERE pos <= COALESCE(
      (SELECT min(pos) FROM due WHERE NOT paid) - 1,
      v_elapsed
    ) AND paid
  )
  SELECT COALESCE(streak, 0) INTO v_streak FROM run;

  -- ratios on the elapsed scale
  v_ratio    := CASE WHEN v_elapsed > 0 THEN v_paid_due::NUMERIC / v_elapsed ELSE 0 END;
  v_streak_r := CASE WHEN v_elapsed > 0 THEN LEAST(v_streak, v_elapsed)::NUMERIC / v_elapsed ELSE 0 END;

  v_score := v_ratio * 60 + v_streak_r * 25;
  IF v_paid_due >= 2 THEN v_score := v_score + 10; END IF;   -- consistency bonus
  IF v_paid_due = 0 THEN v_score := 5; END IF;              -- floor for non-payers
  v_score := round(LEAST(v_score, 100));

  v_tier := CASE
    WHEN v_score >= 55 THEN 'High'
    WHEN v_score >= 30 THEN 'Medium'
    ELSE 'Low'
  END;

  RETURN QUERY SELECT v_score::INT, v_tier;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 5. Apply-to-order helper ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_rejoin_score(p_order_id UUID)
RETURNS VOID AS $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM public.compute_rejoin_score(p_order_id);
  UPDATE public.orders
    SET rejoin_score = r.score, rejoin_tier = r.tier
    WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Trigger: recompute when a month's payment changes -----------------------
CREATE OR REPLACE FUNCTION public.trg_refresh_rejoin_score()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.refresh_rejoin_score(COALESCE(NEW.order_id, OLD.order_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS rejoin_score_refresh ON public.monthly_payments;
CREATE TRIGGER rejoin_score_refresh
  AFTER INSERT OR UPDATE OF payment_status OR DELETE
  ON public.monthly_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_rejoin_score();

-- 7. One-time backfill for all existing orders -------------------------------
DO $$
DECLARE oid UUID;
BEGIN
  FOR oid IN SELECT id FROM public.orders LOOP
    PERFORM public.refresh_rejoin_score(oid);
  END LOOP;
END $$;

-- 8. Index for sorting/filtering by tier & score -----------------------------
CREATE INDEX IF NOT EXISTS idx_orders_rejoin_score ON public.orders (rejoin_score DESC);
CREATE INDEX IF NOT EXISTS idx_orders_rejoin_tier  ON public.orders (rejoin_tier);

COMMIT;

-- ============================================================================
-- VERIFICATION (safe to run after the migration — read-only).
-- After running the migration above, run these two queries in the SQL editor
-- to confirm scores populated. Expected: NOT all zeros / not all 'Unscored'.
-- ============================================================================
-- SELECT rejoin_tier, count(*), round(avg(rejoin_score),1) AS avg_score
-- FROM public.orders GROUP BY rejoin_tier ORDER BY 1;
--
-- SELECT name, rejoin_score, rejoin_tier
-- FROM public.orders
-- WHERE rejoin_score IS NOT NULL
-- ORDER BY rejoin_score DESC LIMIT 10;
--
-- Sanity check that payment data exists at all (if this is 0, the scores will
-- all be low and monthly_payments was never populated):
-- SELECT count(*) AS completed_payments FROM public.monthly_payments
-- WHERE lower(btrim(payment_status)) = 'completed';
