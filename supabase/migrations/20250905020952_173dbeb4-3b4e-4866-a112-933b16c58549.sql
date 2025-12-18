-- Crear función para obtener el siguiente número de pedido incremental
CREATE OR REPLACE FUNCTION public.get_next_order_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    last_order_number integer := 999; -- Empezar desde T1000
    next_number integer;
    result_id text;
BEGIN
    -- Buscar el último pedido con formato T#### (solo números después de T)
    SELECT CAST(SUBSTRING(pedido_id FROM 2) AS integer)
    INTO last_order_number
    FROM pedidos 
    WHERE pedido_id ~ '^T[0-9]+$'  -- Regex para formato T seguido de solo números
    ORDER BY CAST(SUBSTRING(pedido_id FROM 2) AS integer) DESC
    LIMIT 1;
    
    -- Si no encontramos ningún pedido con formato T####, empezar desde 999
    -- para que el primer pedido sea T1000
    IF last_order_number IS NULL THEN
        last_order_number := 999;
    END IF;
    
    -- Calcular el siguiente número
    next_number := last_order_number + 1;
    
    -- Formatear como T#### 
    result_id := 'T' || next_number::text;
    
    RETURN result_id;
END;
$function$