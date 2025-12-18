-- Fix the get_processed_orders_today function

CREATE OR REPLACE FUNCTION public.get_processed_orders_today(start_date timestamp with time zone, end_date timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
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
$function$;