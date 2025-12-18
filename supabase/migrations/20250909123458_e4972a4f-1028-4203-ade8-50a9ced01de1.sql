-- Update delete_sale_with_stock_release function to preserve assignments
CREATE OR REPLACE FUNCTION public.delete_sale_with_stock_release(sale_uuid uuid, deleted_by_user_id uuid, deleted_by_user_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    assignment_record RECORD;
    venta_data RECORD;
BEGIN
    -- Obtener información de la venta
    SELECT * INTO venta_data 
    FROM ventas 
    WHERE id = sale_uuid;
    
    IF venta_data IS NULL THEN
        RAISE NOTICE 'Venta no encontrada: %', sale_uuid;
        RETURN false;
    END IF;
    
    -- Liberar todo el stock comprometido (pero mantener las asignaciones para referencia)
    FOR assignment_record IN 
        SELECT stock_id, cantidad_asignada
        FROM ventas_asignaciones 
        WHERE venta_id = sale_uuid
    LOOP
        -- Mover stock de comprometido de vuelta a disponible
        UPDATE stockxbin 
        SET 
            disponibles = disponibles + assignment_record.cantidad_asignada,
            comprometido = comprometido - assignment_record.cantidad_asignada,
            updated_at = now()
        WHERE id = assignment_record.stock_id;
    END LOOP;
    
    -- Marcar como eliminado y archivar (NO eliminamos las asignaciones)
    UPDATE ventas 
    SET 
        estado = 'archivado',
        eliminado_por_usuario_id = deleted_by_user_id,
        eliminado_por_usuario_nombre = deleted_by_user_name,
        fecha_eliminacion = now(),
        motivo_eliminacion = 'Eliminado por usuario',
        updated_at = now()
    WHERE id = sale_uuid;
    
    RETURN true;
END;
$function$;

-- Update delete_order_with_stock_release function to preserve assignments
CREATE OR REPLACE FUNCTION public.delete_order_with_stock_release(order_uuid uuid, deleted_by_user_id uuid, deleted_by_user_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    assignment_record RECORD;
    pedido_data RECORD;
BEGIN
    -- Obtener información del pedido
    SELECT * INTO pedido_data 
    FROM pedidos 
    WHERE id = order_uuid;
    
    IF pedido_data IS NULL THEN
        RAISE NOTICE 'Pedido no encontrado: %', order_uuid;
        RETURN false;
    END IF;
    
    -- Liberar todo el stock comprometido (pero mantener las asignaciones para referencia)
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
    END LOOP;
    
    -- Marcar como eliminado y archivar (NO eliminamos las asignaciones)
    UPDATE pedidos 
    SET 
        estado = 'archivado',
        eliminado_por_usuario_id = deleted_by_user_id,
        eliminado_por_usuario_nombre = deleted_by_user_name,
        fecha_eliminacion = now(),
        motivo_eliminacion = 'Eliminado por usuario',
        updated_at = now()
    WHERE id = order_uuid;
    
    RETURN true;
END;
$function$;