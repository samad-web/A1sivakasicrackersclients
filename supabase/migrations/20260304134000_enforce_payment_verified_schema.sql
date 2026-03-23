-- Enforce schema for payment_verified column in orders table
-- This ensures the column exists with correct data type, default, and not-null constraint.

DO $$ 
BEGIN
    -- 1. Ensure the column exists and is boolean
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'orders' 
        AND column_name = 'payment_verified'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN payment_verified BOOLEAN DEFAULT FALSE NOT NULL;
    ELSE
        -- 2. If it exists, ensure it's BOOLEAN (attempt cast if necessary, though usually it's already boolean here)
        -- We use USING clause to convert existing data if possible
        ALTER TABLE public.orders 
        ALTER COLUMN payment_verified TYPE BOOLEAN 
        USING (COALESCE(payment_verified::BOOLEAN, FALSE));

        -- 3. Ensure default is FALSE
        ALTER TABLE public.orders 
        ALTER COLUMN payment_verified SET DEFAULT FALSE;

        -- 4. Ensure NOT NULL (after filling nulls)
        UPDATE public.orders SET payment_verified = FALSE WHERE payment_verified IS NULL;
        ALTER TABLE public.orders 
        ALTER COLUMN payment_verified SET NOT NULL;
    END IF;
END $$;
