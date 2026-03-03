-- Migration to add structured address columns to the orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS address_line1 TEXT,
ADD COLUMN IF NOT EXISTS address_line2 TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS pincode TEXT,
ADD COLUMN IF NOT EXISTS state TEXT;

-- Optional: Comments for clarity
COMMENT ON COLUMN public.orders.address_line1 IS 'First line of the customer address';
COMMENT ON COLUMN public.orders.address_line2 IS 'Second line of the customer address (optional)';
COMMENT ON COLUMN public.orders.city IS 'City or town';
COMMENT ON COLUMN public.orders.pincode IS 'Postal code';
COMMENT ON COLUMN public.orders.state IS 'State or province';
