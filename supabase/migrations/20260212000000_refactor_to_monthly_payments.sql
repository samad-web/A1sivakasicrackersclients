-- ====================================================================
-- Migration: Add Monthly Payments Tracking & Deduplicate Orders
-- Description: Creates a separate table to track payment status by month
--              and converts the existing one-row-per-month data into 
--              a relational structure.
-- DATE FORMAT: '2024-01' (YYYY-MM)
-- ====================================================================

BEGIN;

-- 1. Create monthly_payments table
CREATE TABLE IF NOT EXISTS public.monthly_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  month_name text NOT NULL CHECK (month_name IN (
    'November', 'December', 'January', 'February', 'March', 
    'April', 'May', 'June', 'July', 'August', 'September'
  )),
  payment_status text NOT NULL DEFAULT 'Pending' CHECK (payment_status IN (
    'Pending', 'Completed', 'Empty', 'Partial'
  )),
  payment_date timestamp NULL,
  payment_amount numeric DEFAULT 0,
  notes text NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  
  CONSTRAINT monthly_payments_pkey PRIMARY KEY (id),
  CONSTRAINT monthly_payments_order_fk FOREIGN KEY (order_id) 
    REFERENCES public.orders(id) ON DELETE CASCADE,
  CONSTRAINT unique_order_month UNIQUE (order_id, month_name)
);

-- 2. Create useful indexes
CREATE INDEX IF NOT EXISTS idx_monthly_payments_order_id ON public.monthly_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_monthly_payments_status ON public.monthly_payments(payment_status);
CREATE INDEX IF NOT EXISTS idx_monthly_payments_month ON public.monthly_payments(month_name);

-- 3. Data Migration: Populate monthly_payments from current orders rows
-- We identify unique physical orders by receipt_no, name, and number
-- and pick the earliest ID as the master ID.
-- DATE FORMAT ADJUSTED: Using to_date with 'YYYY-MM' pattern
INSERT INTO public.monthly_payments (order_id, month_name, payment_status, payment_date, created_at, updated_at)
SELECT 
  mapping.master_id,
  TRIM(to_char(to_date(o.current_month, 'YYYY-MM'), 'Month')) as month_name,
  CASE 
    WHEN o.payment_verified = true THEN 'Completed'
    WHEN (o.payment_verified = false OR o.payment_verified IS NULL) AND o.order_completed = true THEN 'Completed' -- Migration safety
    ELSE 'Pending'
  END as payment_status,
  CASE WHEN o.payment_verified = true THEN o.payment_verified_at ELSE NULL END as payment_date,
  o.created_at,
  o.updated_at
FROM public.orders o
JOIN (
  SELECT receipt_no, name, number, MIN(id::text)::uuid as master_id
  FROM public.orders
  GROUP BY receipt_no, name, number
) mapping ON o.receipt_no = mapping.receipt_no AND o.name = mapping.name AND o.number = mapping.number
WHERE o.current_month IS NOT NULL  -- Skip rows without a month
ON CONFLICT (order_id, month_name) DO UPDATE SET
  payment_status = EXCLUDED.payment_status,
  payment_date = EXCLUDED.payment_date,
  updated_at = EXCLUDED.updated_at;

-- 4. Clean up orders: Delete redundant rows
-- Keep only the master rows (earliest ID per unique order)
DELETE FROM public.orders
WHERE id NOT IN (
  SELECT MIN(id::text)::uuid
  FROM public.orders
  GROUP BY receipt_no, name, number
);

-- 5. Add unique constraint to orders to prevent future duplicates
ALTER TABLE public.orders ADD CONSTRAINT unique_physical_order UNIQUE (receipt_no, name, number);

-- 6. Updated_at trigger for monthly_payments
CREATE OR REPLACE FUNCTION public.update_monthly_payments_updated_at()
RETURNS trigger AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_monthly_payments_updated_at
  BEFORE UPDATE ON public.monthly_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_monthly_payments_updated_at();

-- 7. Initialize payment records for NEW orders
-- Note: 'Empty' status for future months
CREATE OR REPLACE FUNCTION public.initialize_monthly_payments()
RETURNS trigger AS $$
DECLARE
  m_name text;
BEGIN
  FOREACH m_name IN ARRAY ARRAY[
    'November', 'December', 'January', 'February', 'March',
    'April', 'May', 'June', 'July', 'August', 'September'
  ]
  LOOP
    INSERT INTO public.monthly_payments (order_id, month_name, payment_status)
    VALUES (new.id, m_name, 'Empty')
    ON CONFLICT (order_id, month_name) DO NOTHING;
  END LOOP;
  
  RETURN new;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER initialize_payments_on_order_create
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.initialize_monthly_payments();

-- 8. Enable RLS and Policies
ALTER TABLE public.monthly_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for authenticated users"
  ON public.monthly_payments
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 9. (Optional but Recommended) Remove legacy columns from orders table
-- Uncomment these if you are confident in the migration
-- ALTER TABLE public.orders DROP COLUMN current_month;
-- ALTER TABLE public.orders DROP COLUMN payment_verified;
-- ALTER TABLE public.orders DROP COLUMN payment_verified_at;

COMMIT;

-- ====================================================================
-- Post-Migration Verification Queries
-- ====================================================================

-- Verify migration success
-- SELECT 
--   'Total Orders' as metric, COUNT(*) as count FROM public.orders
-- UNION ALL
-- SELECT 
--   'Total Payment Records' as metric, COUNT(*) as count FROM public.monthly_payments
-- UNION ALL
-- SELECT 
--   'Completed Payments' as metric, COUNT(*) as count 
--   FROM public.monthly_payments WHERE payment_status = 'Completed'
-- UNION ALL
-- SELECT 
--   'Pending Payments' as metric, COUNT(*) as count 
--   FROM public.monthly_payments WHERE payment_status = 'Pending';

-- View payment breakdown by month
-- SELECT 
--   month_name,
--   COUNT(*) as total,
--   SUM(CASE WHEN payment_status = 'Completed' THEN 1 ELSE 0 END) as completed,
--   SUM(CASE WHEN payment_status = 'Pending' THEN 1 ELSE 0 END) as pending,
--   SUM(CASE WHEN payment_status = 'Empty' THEN 1 ELSE 0 END) as empty
-- FROM public.monthly_payments
-- GROUP BY month_name
-- ORDER BY 
--   CASE month_name
--     WHEN 'November' THEN 1
--     WHEN 'December' THEN 2
--     WHEN 'January' THEN 3
--     WHEN 'February' THEN 4
--     WHEN 'March' THEN 5
--     WHEN 'April' THEN 6
--     WHEN 'May' THEN 7
--     WHEN 'June' THEN 8
--     WHEN 'July' THEN 9
--     WHEN 'August' THEN 10
--     WHEN 'September' THEN 11
--   END;
