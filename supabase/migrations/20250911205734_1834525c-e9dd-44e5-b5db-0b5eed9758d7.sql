-- Fix get_next_sales_number to use ventas.venta_id instead of pedidos.pedido_id
CREATE OR REPLACE FUNCTION public.get_next_sales_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    last_sales_number integer := 999; -- Start from V1000
    next_number integer;
    result_id text;
BEGIN
    -- Find last venta with format V#### in ventas table
    SELECT CAST(SUBSTRING(venta_id FROM 2) AS integer)
    INTO last_sales_number
    FROM ventas 
    WHERE venta_id ~ '^V[0-9]+$'
    ORDER BY CAST(SUBSTRING(venta_id FROM 2) AS integer) DESC
    LIMIT 1;

    IF last_sales_number IS NULL THEN
        last_sales_number := 999;
    END IF;

    next_number := last_sales_number + 1;
    result_id := 'V' || next_number::text;

    RETURN result_id;
END;
$function$;