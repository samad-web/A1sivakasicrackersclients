-- Rejoin: copy past-cycle customers into the active cycle with new receipt numbers.
-- Additive only: three nullable columns + one function. No existing data changes.

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS previous_order_id   UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS previous_receipt_no TEXT,
  ADD COLUMN IF NOT EXISTS previous_cycle_year INT;

CREATE OR REPLACE FUNCTION public.rejoin_orders(p_order_ids UUID[])
RETURNS TABLE(
  source_order_id   UUID,
  name              TEXT,
  old_receipt_no    TEXT,
  new_order_id      UUID,
  new_receipt_no    TEXT,
  skip_reason       TEXT,
  existing_receipt_no TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_today      DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_cycle_year INT;
  v_start      TIMESTAMPTZ;
  v_end        TIMESTAMPTZ;
  v_next       BIGINT;
  v_batch_ids  UUID[] := '{}';
  v_src        public.orders%ROWTYPE;
  v_existing   TEXT;
  v_new_id     UUID;
  v_id         UUID;
BEGIN
  -- Serializes rejoin calls so two staff can't be handed the same receipt number.
  PERFORM pg_advisory_xact_lock(hashtext('public.rejoin_orders'));

  v_cycle_year := CASE WHEN extract(month FROM v_today) >= 11
                       THEN extract(year FROM v_today)::INT
                       ELSE extract(year FROM v_today)::INT - 1 END;
  v_start := make_timestamptz(v_cycle_year,     11, 1, 0, 0, 0, 'Asia/Kolkata');
  v_end   := make_timestamptz(v_cycle_year + 1, 11, 1, 0, 0, 0, 'Asia/Kolkata');

  SELECT COALESCE(max(o.receipt_no::BIGINT), 0) + 1 INTO v_next
  FROM public.orders o
  WHERE o.created_at >= v_start AND o.created_at < v_end
    AND o.receipt_no ~ '^\d{1,15}$';

  FOREACH v_id IN ARRAY COALESCE(p_order_ids, '{}') LOOP
    SELECT * INTO v_src FROM public.orders o WHERE o.id = v_id;

    IF NOT FOUND THEN
      RETURN QUERY SELECT v_id, NULL::TEXT, NULL::TEXT, NULL::UUID, NULL::TEXT, 'not_found'::TEXT, NULL::TEXT;
      CONTINUE;
    END IF;

    IF v_src.created_at >= v_start AND v_src.created_at < v_end THEN
      RETURN QUERY SELECT v_id, v_src.name, v_src.receipt_no, NULL::UUID, NULL::TEXT, 'already_current'::TEXT, NULL::TEXT;
      CONTINUE;
    END IF;

    -- Rows added earlier in this same call don't count: a customer with two old schemes rejoins both.
    SELECT o.receipt_no INTO v_existing
    FROM public.orders o
    WHERE o.created_at >= v_start AND o.created_at < v_end
      AND btrim(o.number) = btrim(v_src.number)
      AND NOT (o.id = ANY(v_batch_ids))
    ORDER BY o.created_at
    LIMIT 1;

    IF FOUND THEN
      RETURN QUERY SELECT v_id, v_src.name, v_src.receipt_no, NULL::UUID, NULL::TEXT, 'already_in_cycle'::TEXT, v_existing;
      CONTINUE;
    END IF;

    INSERT INTO public.orders (
      receipt_no, scheme, value, name, number, secondary_number, type, district,
      current_month, customer_address, payment_mode,
      previous_order_id, previous_receipt_no, previous_cycle_year
    ) VALUES (
      v_next::TEXT, v_src.scheme, v_src.value, v_src.name, v_src.number, v_src.secondary_number,
      v_src.type, v_src.district, to_char(v_today, 'YYYY-MM'), v_src.customer_address, v_src.payment_mode,
      v_src.id, v_src.receipt_no,
      CASE WHEN extract(month FROM v_src.created_at AT TIME ZONE 'Asia/Kolkata') >= 11
           THEN extract(year FROM v_src.created_at AT TIME ZONE 'Asia/Kolkata')::INT
           ELSE extract(year FROM v_src.created_at AT TIME ZONE 'Asia/Kolkata')::INT - 1 END
    )
    RETURNING id INTO v_new_id;

    v_batch_ids := v_batch_ids || v_new_id;
    RETURN QUERY SELECT v_id, v_src.name, v_src.receipt_no, v_new_id, v_next::TEXT, NULL::TEXT, NULL::TEXT;
    v_next := v_next + 1;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rejoin_orders(UUID[]) TO authenticated;

COMMIT;
