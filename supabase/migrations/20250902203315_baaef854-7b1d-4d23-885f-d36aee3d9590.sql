-- Función para reasignar completamente los items de un pedido
CREATE OR REPLACE FUNCTION public.reassign_order_items(order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    assignment_record RECORD;
    detail_record RECORD;
    stock_record RECORD;
    remaining_quantity INTEGER;
    to_assign INTEGER;
BEGIN
    -- Paso 1: Liberar todo el stock previamente asignado
    FOR assignment_record IN 
        SELECT stock_id, cantidad_asignada
        FROM pedidos_asignaciones 
        WHERE pedido_id = order_id
    LOOP
        -- Mover stock de comprometido de vuelta a disponible
        UPDATE stockxbin 
        SET 
            disponibles = disponibles + assignment_record.cantidad_asignada,
            comprometido = comprometido - assignment_record.cantidad_asignada,
            updated_at = now()
        WHERE id = assignment_record.stock_id;
    END LOOP;
    
    -- Paso 2: Eliminar todas las asignaciones existentes
    DELETE FROM pedidos_asignaciones WHERE pedido_id = order_id;
    
    -- Paso 3: Resetear cantidad_asignada en pedidos_detalle
    UPDATE pedidos_detalle 
    SET cantidad_asignada = 0
    WHERE pedido_id = order_id;
    
    -- Paso 4: Reasignar todo el pedido desde cero
    FOR detail_record IN 
        SELECT id, sku, cantidad_solicitada
        FROM pedidos_detalle 
        WHERE pedido_id = order_id
    LOOP
        remaining_quantity := detail_record.cantidad_solicitada;
        
        -- Skip si no hay cantidad solicitada
        IF remaining_quantity <= 0 THEN
            CONTINUE;
        END IF;
        
        -- Buscar stock disponible para este SKU, ordenado por disponibles DESC
        FOR stock_record IN 
            SELECT id, bin, disponibles, comprometido
            FROM stockxbin 
            WHERE sku = detail_record.sku AND disponibles > 0
            ORDER BY disponibles DESC
        LOOP
            IF remaining_quantity <= 0 THEN
                EXIT;
            END IF;
            
            -- Calcular cuánto asignar de este bin
            to_assign := LEAST(stock_record.disponibles, remaining_quantity);
            
            -- Crear registro de asignación
            INSERT INTO pedidos_asignaciones (
                pedido_id, 
                pedido_detalle_id, 
                sku, 
                bin, 
                cantidad_asignada, 
                stock_id
            ) VALUES (
                order_id,
                detail_record.id,
                detail_record.sku,
                stock_record.bin,
                to_assign,
                stock_record.id
            );
            
            -- Actualizar stockxbin: mover de disponibles a comprometido
            UPDATE stockxbin 
            SET 
                disponibles = disponibles - to_assign,
                comprometido = comprometido + to_assign,
                updated_at = now()
            WHERE id = stock_record.id;
            
            remaining_quantity := remaining_quantity - to_assign;
        END LOOP;
        
        -- Actualizar cantidad_asignada en pedidos_detalle
        UPDATE pedidos_detalle 
        SET cantidad_asignada = detail_record.cantidad_solicitada - remaining_quantity
        WHERE id = detail_record.id;
    END LOOP;
    
    RETURN true;
END;
$function$