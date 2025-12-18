-- Función para eliminar un pedido completamente y liberar stock
CREATE OR REPLACE FUNCTION public.delete_order_completely(order_pedido_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    order_uuid uuid;
    assignment_record RECORD;
BEGIN
    -- Obtener el UUID del pedido
    SELECT id INTO order_uuid 
    FROM pedidos 
    WHERE pedido_id = order_pedido_id;
    
    IF order_uuid IS NULL THEN
        RAISE NOTICE 'Pedido % no encontrado', order_pedido_id;
        RETURN false;
    END IF;
    
    -- Paso 1: Liberar todo el stock comprometido
    FOR assignment_record IN 
        SELECT stock_id, cantidad_asignada
        FROM pedidos_asignaciones 
        WHERE pedido_id = order_uuid
    LOOP
        -- Mover stock de comprometido de vuelta a disponible
        UPDATE stockxbin 
        SET 
            disponibles = disponibles + assignment_record.cantidad_asignada,
            comprometido = comprometido - assignment_record.cantidad_asignada,
            updated_at = now()
        WHERE id = assignment_record.stock_id;
        
        RAISE NOTICE 'Liberado stock: % unidades del stock_id %', 
                     assignment_record.cantidad_asignada, assignment_record.stock_id;
    END LOOP;
    
    -- Paso 2: Eliminar todas las asignaciones
    DELETE FROM pedidos_asignaciones WHERE pedido_id = order_uuid;
    RAISE NOTICE 'Eliminadas asignaciones del pedido %', order_pedido_id;
    
    -- Paso 3: Eliminar todos los detalles del pedido
    DELETE FROM pedidos_detalle WHERE pedido_id = order_uuid;
    RAISE NOTICE 'Eliminados detalles del pedido %', order_pedido_id;
    
    -- Paso 4: Eliminar el pedido principal
    DELETE FROM pedidos WHERE id = order_uuid;
    RAISE NOTICE 'Eliminado pedido principal %', order_pedido_id;
    
    RETURN true;
END;
$function$