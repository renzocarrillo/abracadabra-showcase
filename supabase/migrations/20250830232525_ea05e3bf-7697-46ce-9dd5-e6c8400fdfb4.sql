-- Create a function to count distinct processed orders for today
CREATE OR REPLACE FUNCTION get_processed_orders_today(start_date timestamptz, end_date timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    order_count integer;
BEGIN
    SELECT COUNT(DISTINCT pedidoid)
    INTO order_count
    FROM "pedidos2.0"
    WHERE "documentoEmitido" = true
    AND "updated_at" >= start_date
    AND "updated_at" < end_date
    AND pedidoid IS NOT NULL;
    
    RETURN COALESCE(order_count, 0);
END;
$$;