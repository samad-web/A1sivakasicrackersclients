-- ====================================================================
-- Migration: Setup Monthly Cron Job
-- Description: Enables pg_cron extension and schedules the monthly
--              reset job to run at 00:01 on the 1st of every month.
-- IMPORTANT: You must replace <project-ref> with your actual Supabase project reference
--            and configure the service role key properly.
-- ====================================================================

BEGIN;

-- 1. Enable pg_cron extension (requires superuser privileges)
-- Note: In Supabase, pg_cron is typically enabled by default or via dashboard
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Grant permission to use pg_cron
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- 3. Schedule the monthly reset job
-- Runs at 00:01 (12:01 AM) on the 1st day of every month
-- Cron format: minute hour day_of_month month day_of_week
SELECT cron.schedule(
  'monthly-payment-reset',           -- job name
  '1 0 1 * *',                        -- At 00:01 on day 1 of month
  $$
  SELECT
    net.http_post(
      url := (SELECT current_setting('app.settings.supabase_url') || '/functions/v1/monthly-reset'),
      headers := jsonb_build_object(
        'Authorization', 
        'Bearer ' || (SELECT current_setting('app.settings.service_role_key')),
        'Content-Type',
        'application/json'
      )
    ) AS request_id;
  $$
);

-- 4. Create settings table for configuration (if not exists)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text,
  updated_at timestamp DEFAULT now()
);

-- 5. Add comment
COMMENT ON TABLE public.app_settings IS 'Application-level configuration settings';

COMMIT;

-- ====================================================================
-- Manual Configuration Steps (Run in Supabase SQL Editor)
-- ====================================================================

-- After running this migration, you need to set the configuration values:
-- 
-- INSERT INTO public.app_settings (key, value, description) VALUES
-- ('app.settings.supabase_url', 'https://YOUR-PROJECT-REF.supabase.co', 'Supabase project URL'),
-- ('app.settings.service_role_key', 'YOUR-SERVICE-ROLE-KEY', 'Service role key for Edge Functions')
-- ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
-- 
-- To verify the cron job was created:
-- SELECT * FROM cron.job WHERE jobname = 'monthly-payment-reset';
--
-- To manually unschedule (if needed):
-- SELECT cron.unschedule('monthly-payment-reset');
--
-- To manually trigger the reset (for testing):
-- Just call the Edge Function directly via HTTP POST
