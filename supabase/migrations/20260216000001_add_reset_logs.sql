-- ====================================================================
-- Migration: Add Monthly Reset Logs Table
-- Description: Creates a table to track monthly reset operations
--              for monitoring and auditing purposes.
-- ====================================================================

BEGIN;

-- 1. Create monthly_reset_logs table
CREATE TABLE IF NOT EXISTS public.monthly_reset_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  reset_month date NOT NULL,
  archived_count int NOT NULL DEFAULT 0,
  reset_count int NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
  error_message text NULL,
  execution_time_ms int NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  
  CONSTRAINT monthly_reset_logs_pkey PRIMARY KEY (id)
);

-- 2. Create indexes
CREATE INDEX IF NOT EXISTS idx_monthly_reset_logs_reset_month ON public.monthly_reset_logs(reset_month);
CREATE INDEX IF NOT EXISTS idx_monthly_reset_logs_status ON public.monthly_reset_logs(status);
CREATE INDEX IF NOT EXISTS idx_monthly_reset_logs_created_at ON public.monthly_reset_logs(created_at DESC);

-- 3. Add comments
COMMENT ON TABLE public.monthly_reset_logs IS 'Tracks execution of monthly reset operations for auditing and monitoring';
COMMENT ON COLUMN public.monthly_reset_logs.reset_month IS 'The month that was reset (first day of the new month)';
COMMENT ON COLUMN public.monthly_reset_logs.archived_count IS 'Number of payment records archived';
COMMENT ON COLUMN public.monthly_reset_logs.reset_count IS 'Number of payment records reset';

-- 4. Enable RLS
ALTER TABLE public.monthly_reset_logs ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS policy (read-only for authenticated users)
CREATE POLICY "Allow read for authenticated users"
  ON public.monthly_reset_logs
  FOR SELECT
  TO authenticated
  USING (true);

-- 6. Create function to get last successful reset
CREATE OR REPLACE FUNCTION public.get_last_successful_reset()
RETURNS table(reset_month date, archived_count int, reset_count int, created_at timestamp) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mrl.reset_month,
    mrl.archived_count,
    mrl.reset_count,
    mrl.created_at
  FROM public.monthly_reset_logs mrl
  WHERE mrl.status = 'success'
  ORDER BY mrl.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
