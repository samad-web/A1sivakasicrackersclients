-- Optimize orders table with additional indexes for performance
-- Index on created_at for faster default sorting
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- Composite index for the most common filter pattern (month + type)
CREATE INDEX IF NOT EXISTS idx_orders_month_type ON public.orders(current_month, type);

-- Composite index for the second most common filter pattern (month + payment status)
CREATE INDEX IF NOT EXISTS idx_orders_month_payment ON public.orders(current_month, payment_verified);
