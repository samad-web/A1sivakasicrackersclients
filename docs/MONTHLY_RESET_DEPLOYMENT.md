# Monthly Reset System - Deployment Guide

## Overview

This guide explains how to deploy and configure the automated monthly reset system that archives payment data and resets statuses on the 1st of each month.

## Prerequisites

- Supabase CLI installed (`npm install -g supabase`)
- Supabase project with active database
- Service role key (found in Supabase Dashboard → Settings → API)

## Deployment Steps

### 1. Run Database Migrations

Apply the database schema changes:

```bash
# Navigate to project directory
cd c:\Users\mas20\Desktop\work\A1_Phase2

# Apply migrations (if using Supabase CLI)
supabase db push

# OR manually run in Supabase SQL Editor:
# - 20260216000000_add_monthly_archives.sql
# - 20260216000001_add_reset_logs.sql
# - 20260216000002_setup_monthly_cron.sql
```

### 2. Deploy Edge Function

Deploy the monthly-reset function:

```bash
# Login to Supabase
supabase login

# Link your project
supabase link --project-ref YOUR-PROJECT-REF

# Deploy the function
supabase functions deploy monthly-reset

# Set environment variables (if needed)
supabase secrets set CUSTOM_VAR=value
```

### 3. Configure Cron Job

After running the migrations, configure the cron job with your actual project details:

```sql
-- Run in Supabase SQL Editor
-- Replace YOUR-PROJECT-REF and YOUR-SERVICE-ROLE-KEY

INSERT INTO public.app_settings (key, value, description) VALUES
('app.settings.supabase_url', 'https://YOUR-PROJECT-REF.supabase.co', 'Supabase project URL'),
('app.settings.service_role_key', 'YOUR-SERVICE-ROLE-KEY', 'Service role key for Edge Functions')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

### 4. Verify Installation

Check that everything is set up correctly:

```sql
-- Verify cron job is scheduled
SELECT * FROM cron.job WHERE jobname = 'monthly-payment-reset';

-- Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('monthly_archives', 'monthly_reset_logs', 'app_settings');
```

### 5. Manual Testing

Test the function before waiting for the cron job:

```bash
# Using curl (replace with your project details)
curl -X POST https://YOUR-PROJECT-REF.supabase.co/functions/v1/monthly-reset \
  -H "Authorization: Bearer YOUR-SERVICE-ROLE-KEY" \
  -H "Content-Type: application/json"

# Or use Supabase Functions invoke
supabase functions invoke monthly-reset
```

Check the results:

```sql
-- View reset logs
SELECT * FROM public.monthly_reset_logs ORDER BY created_at DESC LIMIT 5;

-- View archived data
SELECT * FROM public.monthly_archives ORDER BY archived_at DESC LIMIT 10;

-- Check current payment statuses
SELECT payment_status, COUNT(*) 
FROM public.monthly_payments 
GROUP BY payment_status;
```

## Monitoring

### View Cron Job Status

```sql
-- Check last run time
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'monthly-payment-reset')
ORDER BY start_time DESC 
LIMIT 5;
```

### View Reset History

```sql
-- View all reset operations
SELECT 
  reset_month,
  archived_count,
  reset_count,
  status,
  execution_time_ms,
  created_at
FROM public.monthly_reset_logs
ORDER BY created_at DESC;
```

### Check Edge Function Logs

In Supabase Dashboard:
1. Go to Edge Functions
2. Select `monthly-reset`
3. View Logs tab

## Troubleshooting

### Cron job not running?

```sql
-- Check if pg_cron is enabled
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- Manually trigger the job
SELECT cron.schedule('test-run', '* * * * *', $$SELECT 1$$);
SELECT cron.unschedule('test-run');
```

### Function errors?

Check the `monthly_reset_logs` table:

```sql
SELECT * FROM public.monthly_reset_logs WHERE status = 'failed';
```

### Reschedule cron job?

```sql
-- Unschedule existing
SELECT cron.unschedule('monthly-payment-reset');

-- Create new schedule
SELECT cron.schedule(
  'monthly-payment-reset',
  '1 0 1 * *',
  $$ /* your SQL here */ $$
);
```

## Maintenance

### Manually trigger a reset

```bash
curl -X POST https://YOUR-PROJECT-REF.supabase.co/functions/v1/monthly-reset \
  -H "Authorization: Bearer YOUR-SERVICE-ROLE-KEY"
```

### View archived data for a specific month

```sql
SELECT 
  o.receipt_no,
  o.name,
  ma.month_name,
  ma.payment_status,
  ma.payment_date,
  ma.archived_at
FROM public.monthly_archives ma
JOIN public.orders o ON ma.order_id = o.id
WHERE ma.archive_date = '2026-02-01'  -- First day of reset month
ORDER BY ma.archived_at DESC;
```

### Clean up old logs (optional)

```sql
-- Delete logs older than 6 months
DELETE FROM public.monthly_reset_logs 
WHERE created_at < NOW() - INTERVAL '6 months';
```

## Security Notes

- The service role key has admin privileges - keep it secret
- The cron job runs with database privileges
- RLS policies protect user data from unauthorized access
- Edge Function validates requests before processing

## Configuration Files

- **Migrations**: `supabase/migrations/20260216000000_*.sql`
- **Edge Function**: `supabase/functions/monthly-reset/index.ts`
- **Environment**: Set via Supabase Dashboard or `supabase secrets`
