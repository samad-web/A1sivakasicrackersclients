-- RPC to verify payment for multiple months at once (advance payment)
CREATE OR REPLACE FUNCTION public.advance_payment_verification(
  p_order_id UUID,
  p_month_names TEXT[],
  p_is_verified BOOLEAN
)
RETURNS JSONB AS $$
DECLARE
  v_payment_count INT;
BEGIN
  -- Update monthly_payments for all specified months
  UPDATE public.monthly_payments
  SET
    payment_status = CASE WHEN p_is_verified THEN 'Completed' ELSE 'Pending' END,
    payment_date = CASE WHEN p_is_verified THEN now() ELSE NULL END,
    updated_at = now()
  WHERE order_id = p_order_id AND month_name = ANY(p_month_names);

  GET DIAGNOSTICS v_payment_count = ROW_COUNT;

  -- Update orders master flag
  UPDATE public.orders
  SET
    payment_verified = p_is_verified,
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'payment_updated_count', v_payment_count,
    'order_id', p_order_id,
    'months', to_jsonb(p_month_names),
    'is_verified', p_is_verified
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
