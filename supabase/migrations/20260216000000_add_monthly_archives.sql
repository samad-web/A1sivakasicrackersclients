-- ====================================================================
-- Migration: Add Monthly Archives Table
-- Description: Creates a table to store historical payment data
--              that gets archived at the start of each month.
-- ====================================================================

BEGIN;

-- 1. Create monthly_archives table
CREATE TABLE IF NOT EXISTS public.monthly_archives (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  archive_date date NOT NULL,
  order_id uuid NOT NULL,
  month_name text NOT NULL CHECK (month_name IN (
    'November', 'December', 'January', 'February', 'March', 
    'April', 'May', 'June', 'July', 'August', 'September'
  )),
  payment_status text NOT NULL CHECK (payment_status IN (
    'Pending', 'Completed', 'Empty', 'Partial'
  )),
  payment_date timestamp NULL,
  payment_amount numeric DEFAULT 0,
  notes text NULL,
  archived_at timestamp NOT NULL DEFAULT now(),
  
  CONSTRAINT monthly_archives_pkey PRIMARY KEY (id),
  CONSTRAINT monthly_archives_order_fk FOREIGN KEY (order_id) 
    REFERENCES public.orders(id) ON DELETE CASCADE,
  CONSTRAINT unique_archive_entry UNIQUE (archive_date, order_id, month_name)
);

-- 2. Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_monthly_archives_archive_date ON public.monthly_archives(archive_date);
CREATE INDEX IF NOT EXISTS idx_monthly_archives_order_id ON public.monthly_archives(order_id);
CREATE INDEX IF NOT EXISTS idx_monthly_archives_month ON public.monthly_archives(month_name);
CREATE INDEX IF NOT EXISTS idx_monthly_archives_status ON public.monthly_archives(payment_status);

-- 3. Add comment for documentation
COMMENT ON TABLE public.monthly_archives IS 'Stores historical payment data that is archived at the start of each month';
COMMENT ON COLUMN public.monthly_archives.archive_date IS 'The date when this data was archived (first day of the month)';
COMMENT ON COLUMN public.monthly_archives.order_id IS 'Reference to the order this payment belongs to';
COMMENT ON COLUMN public.monthly_archives.month_name IS 'The month this payment was for';

-- 4. Enable RLS
ALTER TABLE public.monthly_archives ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS policy for authenticated users
CREATE POLICY "Allow all operations for authenticated users"
  ON public.monthly_archives
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;
