-- Add payment_mode column to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_mode TEXT;
