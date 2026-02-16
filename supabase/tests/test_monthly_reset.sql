-- ====================================================================
-- Test Script for Monthly Reset System
-- Description: Run these queries to test the monthly reset functionality
-- ====================================================================

-- Step 1: Create test data
-- Add some test payment records with various statuses

BEGIN;

-- Insert a test order if needed
INSERT INTO public.orders (receipt_no, scheme, value, name, number, type, district)
VALUES ('TEST-001', 'Test Scheme', 1000, 'Test Customer', '1234567890', 'Individual', 'Test District')
ON CONFLICT (receipt_no, name, number) DO NOTHING
RETURNING id;

-- Get the test order ID (replace with actual ID)
DO $$
DECLARE
  test_order_id uuid;
BEGIN
  SELECT id INTO test_order_id FROM public.orders WHERE receipt_no = 'TEST-001' LIMIT 1;
  
  -- Update some monthly payments to "Completed" for testing
  UPDATE public.monthly_payments
  SET 
    payment_status = 'Completed',
    payment_date = NOW(),
    payment_amount = 100,
    notes = 'Test payment for archiving'
  WHERE order_id = test_order_id
  AND month_name IN ('November', 'December', 'January');
  
  -- Set some to Pending
  UPDATE public.monthly_payments
  SET payment_status = 'Pending'
  WHERE order_id = test_order_id
  AND month_name IN ('February', 'March');
END $$;

COMMIT;

-- Step 2: Verify test data
SELECT 
  o.receipt_no,
  mp.month_name,
  mp.payment_status,
  mp.payment_date
FROM public.monthly_payments mp
JOIN public.orders o ON mp.order_id = o.id
WHERE o.receipt_no = 'TEST-001'
ORDER BY 
  CASE mp.month_name
    WHEN 'November' THEN 1
    WHEN 'December' THEN 2
    WHEN 'January' THEN 3
    WHEN 'February' THEN 4
    WHEN 'March' THEN 5
    WHEN 'April' THEN 6
    WHEN 'May' THEN 7
    WHEN 'June' THEN 8
    WHEN 'July' THEN 9
    WHEN 'August' THEN 10
    WHEN 'September' THEN 11
  END;

-- Step 3: Check current stats before reset
SELECT 
  'Before Reset' as timing,
  payment_status,
  COUNT(*) as count
FROM public.monthly_payments
GROUP BY payment_status
ORDER BY payment_status;

-- Step 4: Manually trigger the reset (via Edge Function)
-- Use curl or Supabase Dashboard to call:
-- POST https://YOUR-PROJECT-REF.supabase.co/functions/v1/monthly-reset
-- Headers: Authorization: Bearer YOUR-SERVICE-ROLE-KEY

-- Step 5: Check stats after reset
SELECT 
  'After Reset' as timing,
  payment_status,
  COUNT(*) as count
FROM public.monthly_payments
GROUP BY payment_status
ORDER BY payment_status;

-- Step 6: Verify archived data
SELECT 
  archive_date,
  COUNT(*) as archived_count,
  SUM(payment_amount) as total_amount
FROM public.monthly_archives
GROUP BY archive_date
ORDER BY archive_date DESC;

-- Step 7: Check reset logs
SELECT 
  reset_month,
  archived_count,
  reset_count,
  status,
  execution_time_ms,
  created_at
FROM public.monthly_reset_logs
ORDER BY created_at DESC
LIMIT 5;

-- Step 8: Test idempotency - try running the function again
-- The function should skip and log a "skipped" status
-- Verify by checking logs again:
SELECT * FROM public.monthly_reset_logs 
WHERE status = 'skipped' 
ORDER BY created_at DESC LIMIT 1;

-- Step 9: Verify data integrity
-- Check that all completed payments were archived
WITH archived_data AS (
  SELECT DISTINCT order_id, month_name 
  FROM public.monthly_archives
  WHERE archive_date = (SELECT MAX(reset_month) FROM public.monthly_reset_logs WHERE status = 'success')
)
SELECT 
  ma.order_id,
  ma.month_name,
  ma.payment_status as archived_status,
  mp.payment_status as current_status
FROM public.monthly_archives ma
LEFT JOIN public.monthly_payments mp ON ma.order_id = mp.order_id AND ma.month_name = mp.month_name
WHERE ma.archive_date = (SELECT MAX(reset_month) FROM public.monthly_reset_logs WHERE status = 'success')
LIMIT 10;

-- Step 10: Cleanup test data (optional)
-- DELETE FROM public.orders WHERE receipt_no = 'TEST-001';
-- DELETE FROM public.monthly_archives WHERE archive_date = CURRENT_DATE;
-- DELETE FROM public.monthly_reset_logs WHERE reset_month = CURRENT_DATE;
