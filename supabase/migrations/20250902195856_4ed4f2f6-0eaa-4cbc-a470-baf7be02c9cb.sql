-- Fix the remaining function with missing search_path

-- Fix the update_pedido_cantidad function
CREATE OR REPLACE FUNCTION public.update_pedido_cantidad()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
    -- Actualizar la cantidad del pedido basándose en la suma de cantidades en pedidos_detalle
    UPDATE public.pedidos 
    SET cantidad = (
        SELECT COALESCE(SUM(cantidad), 0) 
        FROM public.pedidos_detalle 
        WHERE pedido_id = COALESCE(NEW.pedido_id, OLD.pedido_id)
    )
    WHERE id = COALESCE(NEW.pedido_id, OLD.pedido_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$function$;