-- Enhanced RPC with diagnostics for payment verification synchronization
DROP FUNCTION IF EXISTS public.update_order_payment_verification(uuid, text, boolean);

CREATE OR REPLACE FUNCTION public.update_order_payment_verification(
  p_order_id UUID,
  p_month_name TEXT,
  p_is_verified BOOLEAN
)
RETURNS JSONB AS $$
DECLARE
  v_payment_count INT;
  v_order_count INT;
BEGIN
  -- 1. Update monthly_payments table
  UPDATE public.monthly_payments
  SET 
    payment_status = CASE WHEN p_is_verified THEN 'Completed' ELSE 'Pending' END,
    payment_date = CASE WHEN p_is_verified THEN now() ELSE NULL END,
    updated_at = now()
  WHERE order_id = p_order_id AND month_name = p_month_name;
  
  GET DIAGNOSTICS v_payment_count = ROW_COUNT;

  -- 2. Update orders table
  UPDATE public.orders
  SET 
    payment_verified = p_is_verified,
    updated_at = now()
  WHERE id = p_order_id;

  GET DIAGNOSTICS v_order_count = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'payment_updated_count', v_payment_count,
    'order_updated_count', v_order_count,
    'order_id_sent', p_order_id,
    'month_sent', p_month_name,
    'is_verified_sent', p_is_verified
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
