-- Agregar campos para rastrear eliminaciones en pedidos
ALTER TABLE public.pedidos 
ADD COLUMN eliminado_por_usuario_id uuid REFERENCES auth.users(id),
ADD COLUMN eliminado_por_usuario_nombre text,
ADD COLUMN fecha_eliminacion timestamp with time zone,
ADD COLUMN motivo_eliminacion text DEFAULT 'Eliminado por usuario';

-- Agregar campos para rastrear eliminaciones en ventas  
ALTER TABLE public.ventas
ADD COLUMN eliminado_por_usuario_id uuid REFERENCES auth.users(id),
ADD COLUMN eliminado_por_usuario_nombre text,
ADD COLUMN fecha_eliminacion timestamp with time zone,
ADD COLUMN motivo_eliminacion text DEFAULT 'Eliminado por usuario';

-- Crear función para eliminar pedido completamente liberando stock
CREATE OR REPLACE FUNCTION public.delete_order_with_stock_release(order_uuid uuid, deleted_by_user_id uuid, deleted_by_user_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    
    -- Liberar todo el stock comprometido
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
    
    -- Marcar como eliminado y archivar
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
$$;

-- Crear función para eliminar venta completamente liberando stock
CREATE OR REPLACE FUNCTION public.delete_sale_with_stock_release(sale_uuid uuid, deleted_by_user_id uuid, deleted_by_user_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    
    -- Liberar todo el stock comprometido
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
    
    -- Marcar como eliminado y archivar
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
$$;