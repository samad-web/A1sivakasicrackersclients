-- Webhook trigger removed and moved to frontend (useOrders.ts) 
-- to prevent database statement timeouts during synchronous HTTP calls.
-- Previously: trigger_invoice_generation()
DROP TRIGGER IF EXISTS on_payment_verified ON public.orders;
DROP FUNCTION IF EXISTS public.trigger_invoice_generation();
