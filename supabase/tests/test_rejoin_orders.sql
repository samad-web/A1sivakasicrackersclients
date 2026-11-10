-- Tests for public.rejoin_orders. Runs in a transaction and ROLLS BACK: safe on the live DB.
-- Each failed check raises an exception naming the acceptance criterion (AC#) from
-- build-docs/features/rejoin-next-cycle.md.

BEGIN;

CREATE TEMP TABLE t_ids (k TEXT PRIMARY KEY, id UUID) ON COMMIT DROP;
CREATE TEMP TABLE t_res ON COMMIT DROP AS
  SELECT * FROM public.rejoin_orders('{}'::UUID[]) LIMIT 0;

DO $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_cy    INT  := CASE WHEN extract(month FROM v_today) >= 11 THEN extract(year FROM v_today)::INT
                       ELSE extract(year FROM v_today)::INT - 1 END;
  v_prev  TIMESTAMPTZ := make_timestamptz(v_cy - 1, 12, 1, 12, 0, 0, 'Asia/Kolkata');
  v_cur   TIMESTAMPTZ := make_timestamptz(v_cy, 11, 2, 12, 0, 0, 'Asia/Kolkata');
  v_next  BIGINT;
  v_cnt   INT;
  r       RECORD;
  v_new_a UUID;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('A',    'TEST-RJ-A',  '0000000901', v_prev),
    ('B',    'TEST-RJ-B',  '0000000902', v_prev),
    ('B2',   'TEST-RJ-B2', '0000000902', v_prev),
    ('C',    'TEST-RJ-C',  '0000000903', v_prev),
    ('CCUR', 'TEST-RJ-CC', '0000000903', v_cur)
  ) AS f(k, rcpt, phone, ts) LOOP
    INSERT INTO public.orders (receipt_no, scheme, value, name, number, type, district, current_month,
                               created_at, payment_verified, order_completed, invoice_url)
    VALUES (r.rcpt, '500', 6000, 'Test ' || r.k, r.phone, '12 Months', 'TESTVILLE', 'TEST',
            r.ts, true, true, 'https://example.invalid/inv')
    RETURNING id INTO v_new_a;
    INSERT INTO t_ids VALUES (r.k, v_new_a);
  END LOOP;

  SELECT COALESCE(max(receipt_no::BIGINT), 0) + 1 INTO v_next
  FROM public.orders
  WHERE created_at >= make_timestamptz(v_cy, 11, 1, 0, 0, 0, 'Asia/Kolkata')
    AND created_at <  make_timestamptz(v_cy + 1, 11, 1, 0, 0, 0, 'Asia/Kolkata')
    AND receipt_no ~ '^\d{1,15}$';

  INSERT INTO t_res
  SELECT * FROM public.rejoin_orders(ARRAY[
    (SELECT id FROM t_ids WHERE k = 'A'),
    (SELECT id FROM t_ids WHERE k = 'B'),
    (SELECT id FROM t_ids WHERE k = 'B2'),
    (SELECT id FROM t_ids WHERE k = 'C'),
    (SELECT id FROM t_ids WHERE k = 'CCUR'),
    '00000000-0000-0000-0000-0000000000ff'::UUID
  ]);

  -- AC3: one new order per eligible customer, consecutive receipts in input order
  FOR r IN SELECT t.k, res.* FROM t_ids t JOIN t_res res ON res.source_order_id = t.id
           WHERE t.k IN ('A', 'B', 'B2') LOOP
    IF r.new_order_id IS NULL THEN RAISE EXCEPTION 'AC3: % was not rejoined (%)', r.k, r.skip_reason; END IF;
  END LOOP;
  IF (SELECT new_receipt_no FROM t_res JOIN t_ids ON id = source_order_id WHERE k = 'A')  <> v_next::TEXT
  OR (SELECT new_receipt_no FROM t_res JOIN t_ids ON id = source_order_id WHERE k = 'B')  <> (v_next + 1)::TEXT
  OR (SELECT new_receipt_no FROM t_res JOIN t_ids ON id = source_order_id WHERE k = 'B2') <> (v_next + 2)::TEXT THEN
    RAISE EXCEPTION 'AC3: receipts not consecutive from %', v_next;
  END IF;

  -- AC4: phone already in active cycle -> skipped, existing receipt reported
  SELECT * INTO r FROM t_res JOIN t_ids ON id = source_order_id WHERE k = 'C';
  IF r.skip_reason IS DISTINCT FROM 'already_in_cycle' OR r.existing_receipt_no IS DISTINCT FROM 'TEST-RJ-CC' THEN
    RAISE EXCEPTION 'AC4: expected C skipped already_in_cycle/TEST-RJ-CC, got %/%', r.skip_reason, r.existing_receipt_no;
  END IF;

  -- Edge: active-cycle source and unknown id
  IF (SELECT skip_reason FROM t_res JOIN t_ids ON id = source_order_id WHERE k = 'CCUR') IS DISTINCT FROM 'already_current' THEN
    RAISE EXCEPTION 'Edge: active-cycle source not skipped as already_current';
  END IF;
  IF (SELECT skip_reason FROM t_res WHERE source_order_id = '00000000-0000-0000-0000-0000000000ff') IS DISTINCT FROM 'not_found' THEN
    RAISE EXCEPTION 'Edge: unknown id not reported as not_found';
  END IF;

  -- AC3/AC6: new row is clean, linked to old receipt + cycle, dated into active cycle
  v_new_a := (SELECT new_order_id FROM t_res JOIN t_ids ON id = source_order_id WHERE k = 'A');
  SELECT * INTO r FROM public.orders WHERE id = v_new_a;
  IF r.previous_receipt_no <> 'TEST-RJ-A' OR r.previous_cycle_year <> v_cy - 1
     OR r.previous_order_id <> (SELECT id FROM t_ids WHERE k = 'A') THEN
    RAISE EXCEPTION 'AC6: previous link wrong (%, %)', r.previous_receipt_no, r.previous_cycle_year;
  END IF;
  IF r.payment_verified OR r.order_completed OR r.invoice_url IS NOT NULL THEN
    RAISE EXCEPTION 'AC3: new row carried over old flags/invoice';
  END IF;
  IF r.current_month <> to_char(v_today, 'YYYY-MM') OR r.scheme <> '500' OR r.value <> 6000 THEN
    RAISE EXCEPTION 'AC3: copied fields wrong';
  END IF;

  -- AC3: trigger created 12 Empty months
  SELECT count(*) INTO v_cnt FROM public.monthly_payments WHERE order_id = v_new_a AND payment_status = 'Empty';
  IF v_cnt <> 12 THEN RAISE EXCEPTION 'AC3: expected 12 Empty months, got %', v_cnt; END IF;

  -- AC3: old order unchanged
  SELECT * INTO r FROM public.orders WHERE id = (SELECT id FROM t_ids WHERE k = 'A');
  IF r.receipt_no <> 'TEST-RJ-A' OR NOT r.payment_verified OR r.created_at <> v_prev THEN
    RAISE EXCEPTION 'AC3: old order was modified';
  END IF;

  -- Edge: rejoining again is a no-op (already_in_cycle)
  IF (SELECT skip_reason FROM public.rejoin_orders(ARRAY[(SELECT id FROM t_ids WHERE k = 'A')]))
     IS DISTINCT FROM 'already_in_cycle' THEN
    RAISE EXCEPTION 'Edge: second rejoin was not skipped';
  END IF;

  RAISE NOTICE 'rejoin_orders: ALL TESTS PASSED';
END $$;

ROLLBACK;
