-- ====================================================================
-- Migration: Link Existing Orders to Monthly Payments
-- Description: Ensures all existing orders have rows in monthly_payments
--              and adds RLS policies for anonymous access.
-- ====================================================================

BEGIN;

-- 1. Create missing monthly_payments rows for existing orders
-- This is for any orders that didn't get migrated or were created before the trigger
INSERT INTO public.monthly_payments (order_id, month_name, payment_status)
SELECT 
  o.id as order_id,
  m.month_name,
  'Pending' as payment_status
FROM public.orders o
CROSS JOIN (
  SELECT unnest(ARRAY[
    'November', 'December', 'January', 'February', 'March',
    'April', 'May', 'June', 'July', 'August', 'September'
  ]) as month_name
) m
LEFT JOIN public.monthly_payments mp 
  ON mp.order_id = o.id AND mp.month_name = m.month_name
WHERE mp.id IS NULL
ON CONFLICT (order_id, month_name) DO NOTHING;

-- 2. Add RLS policies for anonymous users (since the app seems to use the anon key)
-- If Row Level Security is enabled, we need to allow anon users to see and edit payments
CREATE POLICY "Allow all for anon"
  ON public.monthly_payments
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- Also ensure orders can be seen by anon if not already set
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'orders' AND policyname = 'Allow all for anon'
    ) THEN
        CREATE POLICY "Allow all for anon" ON public.orders FOR ALL TO anon USING (true) WITH CHECK (true);
    END IF;
END
$$;

COMMIT;
