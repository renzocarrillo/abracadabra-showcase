-- Create function to generate next sales number in V#### format
CREATE OR REPLACE FUNCTION public.get_next_sales_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    last_sales_number integer := 999; -- Empezar desde V1000
    next_number integer;
    result_id text;
BEGIN
    -- Buscar el último pedido con formato V#### (solo números después de V)
    SELECT CAST(SUBSTRING(pedido_id FROM 2) AS integer)
    INTO last_sales_number
    FROM pedidos 
    WHERE pedido_id ~ '^V[0-9]+$'  -- Regex para formato V seguido de solo números
    ORDER BY CAST(SUBSTRING(pedido_id FROM 2) AS integer) DESC
    LIMIT 1;
    
    -- Si no encontramos ningún pedido con formato V####, empezar desde 999
    -- para que el primer pedido sea V1000
    IF last_sales_number IS NULL THEN
        last_sales_number := 999;
    END IF;
    
    -- Calcular el siguiente número
    next_number := last_sales_number + 1;
    
    -- Formatear como V#### 
    result_id := 'V' || next_number::text;
    
    RETURN result_id;
END;
$function$;