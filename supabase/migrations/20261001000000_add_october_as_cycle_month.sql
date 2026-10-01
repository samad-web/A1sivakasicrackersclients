-- The Nov-Sep cycle previously excluded October entirely, so the dashboard had no
-- real month to show once September ended and before the next cycle's November began.
-- Making October the 12th cycle month closes that gap. This also documents, in a
-- migration, several functions that were previously only edited live via the dashboard
-- SQL editor (initialize_monthly_payments, cycle_month_position) and were never captured
-- in a migration file.

ALTER TABLE public.monthly_payments DROP CONSTRAINT IF EXISTS monthly_payments_month_name_check;
ALTER TABLE public.monthly_payments ADD CONSTRAINT monthly_payments_month_name_check
  CHECK (month_name = ANY (ARRAY[
    'November'::text, 'December'::text, 'January'::text, 'February'::text, 'March'::text,
    'April'::text, 'May'::text, 'June'::text, 'July'::text, 'August'::text, 'September'::text,
    'October'::text
  ]));

CREATE OR REPLACE FUNCTION public.initialize_monthly_payments()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  m_name text;
BEGIN
  FOREACH m_name IN ARRAY ARRAY[
    'November', 'December', 'January', 'February', 'March',
    'April', 'May', 'June', 'July', 'August', 'September', 'October'
  ]
  LOOP
    INSERT INTO public.monthly_payments (order_id, month_name, payment_status)
    VALUES (new.id, m_name, 'Empty')
    ON CONFLICT (order_id, month_name) DO NOTHING;
  END LOOP;
  RETURN new;
END;
$$;

-- Backfill October rows for orders created before this migration.
INSERT INTO public.monthly_payments (order_id, month_name, payment_status)
SELECT o.id, 'October', 'Empty'
FROM public.orders o
ON CONFLICT (order_id, month_name) DO NOTHING;

-- cycle_month_position maps a month name to its 1-based position in the cycle, used by
-- compute_rejoin_score (via cycle_elapsed_positions) to know how many months are due.
-- 'febraury' is a pre-existing typo guard, kept as-is.
CREATE OR REPLACE FUNCTION public.cycle_month_position(p_month_name text)
RETURNS integer
LANGUAGE sql
AS $$
  SELECT CASE btrim(lower(p_month_name))
    WHEN 'november'  THEN 1
    WHEN 'december'  THEN 2
    WHEN 'january'   THEN 3
    WHEN 'february'  THEN 4
    WHEN 'febraury'  THEN 4
    WHEN 'march'     THEN 5
    WHEN 'april'     THEN 6
    WHEN 'may'       THEN 7
    WHEN 'june'      THEN 8
    WHEN 'july'      THEN 9
    WHEN 'august'    THEN 10
    WHEN 'september' THEN 11
    WHEN 'october'   THEN 12
    ELSE NULL
  END;
$$;
