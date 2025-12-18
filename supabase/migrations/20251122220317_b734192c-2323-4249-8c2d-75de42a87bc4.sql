-- =================================================================
-- MIGRACIÓN: UNIFICACIÓN A SISTEMA DE 2 ESTADOS (disponibles, reservado)
-- =================================================================
-- Propósito: Unificar el manejo de stock de ventas con picking libre
-- Estado actual: 3 estados (disponibles, reservado, comprometido)
-- Estado nuevo: 2 estados (disponibles, reservado)
-- =================================================================

-- =================================================================
-- 1. NUEVAS FUNCIONES PARA VENTAS (Sistema 2 Estados)
-- =================================================================

-- Función: assign_bins_to_sale_v2 (usa RESERVADO en lugar de COMPROMETIDO)
CREATE OR REPLACE FUNCTION public.assign_bins_to_sale_v2(sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    detail_record RECORD;
    stock_record RECORD;
    remaining_quantity INTEGER;
    to_assign INTEGER;
    total_assigned INTEGER := 0;
    skus_processed INTEGER := 0;
    frozen_products TEXT[] := '{}';
    insufficient_stock TEXT[] := '{}';
    v_venta_id TEXT;
BEGIN
    SELECT venta_id INTO v_venta_id FROM ventas WHERE id = sale_id;
    
    RAISE LOG '[ASSIGN_V2] 🔵 Asignando bins para venta % (sistema 2 estados)', v_venta_id;
    
    -- Revertir asignaciones previas (si existen)
    UPDATE stockxbin 
    SET 
        disponibles = disponibles + va.cantidad_asignada,
        reservado = GREATEST(0, COALESCE(reservado, 0) - va.cantidad_asignada),
        updated_at = now()
    FROM ventas_asignaciones va
    WHERE va.venta_id = sale_id 
      AND va.stock_id = stockxbin.id;
    
    DELETE FROM ventas_asignaciones WHERE venta_id = sale_id;
    
    RAISE LOG '[ASSIGN_V2] ✓ Asignaciones anteriores limpiadas';
    
    -- Procesar cada detalle
    FOR detail_record IN 
        SELECT id, sku, cantidad, nombre_producto
        FROM ventas_detalle 
        WHERE venta_id = sale_id
        ORDER BY sku
    LOOP
        remaining_quantity := detail_record.cantidad;
        skus_processed := skus_processed + 1;
        
        RAISE LOG '[ASSIGN_V2]   → SKU: % (necesita: %)', detail_record.sku, remaining_quantity;
        
        -- Verificar congelación
        IF EXISTS (SELECT 1 FROM productos_congelados WHERE sku = detail_record.sku) THEN
            frozen_products := array_append(frozen_products, detail_record.sku || ' (' || detail_record.nombre_producto || ')');
            RAISE LOG '[ASSIGN_V2]   ❌ SKU % congelado', detail_record.sku;
            CONTINUE;
        END IF;
        
        -- Buscar stock disponible
        FOR stock_record IN 
            SELECT s.id, s.bin, s.disponibles
            FROM stockxbin s
            LEFT JOIN bins b ON s.bin = b.bin_code
            WHERE s.sku = detail_record.sku 
              AND s.disponibles > 0
              AND (b.is_frozen IS NULL OR b.is_frozen = false)
            ORDER BY s.disponibles DESC
        LOOP
            IF remaining_quantity <= 0 THEN EXIT; END IF;
            
            to_assign := LEAST(stock_record.disponibles, remaining_quantity);
            
            -- Crear asignación
            INSERT INTO ventas_asignaciones (
                venta_id, venta_detalle_id, sku, bin, cantidad_asignada, stock_id
            ) VALUES (
                sale_id, detail_record.id, detail_record.sku, stock_record.bin, to_assign, stock_record.id
            );
            
            -- CAMBIO CRÍTICO: Mover de disponibles a RESERVADO (no comprometido)
            UPDATE stockxbin 
            SET 
                disponibles = disponibles - to_assign,
                reservado = COALESCE(reservado, 0) + to_assign,
                updated_at = now()
            WHERE id = stock_record.id;
            
            total_assigned := total_assigned + to_assign;
            remaining_quantity := remaining_quantity - to_assign;
            
            RAISE LOG '[ASSIGN_V2]     ✓ Asignado % unidades desde bin % (reservado)', to_assign, stock_record.bin;
        END LOOP;
        
        IF remaining_quantity > 0 THEN
            insufficient_stock := array_append(
                insufficient_stock, 
                detail_record.sku || ': falta ' || remaining_quantity || ' unidades'
            );
            RAISE LOG '[ASSIGN_V2]   ⚠️  Stock insuficiente: faltan % unidades', remaining_quantity;
        END IF;
    END LOOP;
    
    -- Determinar resultado
    IF array_length(frozen_products, 1) > 0 OR array_length(insufficient_stock, 1) > 0 THEN
        RAISE LOG '[ASSIGN_V2] ❌ Asignación FALLIDA para venta %', v_venta_id;
        
        RETURN jsonb_build_object(
            'success', false,
            'venta_id', v_venta_id,
            'total_assigned', total_assigned,
            'skus_processed', skus_processed,
            'frozen_products', frozen_products,
            'insufficient_stock', insufficient_stock,
            'message', 'Asignación incompleta. Revise productos congelados o stock insuficiente.'
        );
    END IF;
    
    RAISE LOG '[ASSIGN_V2] ✅ Asignación EXITOSA: % unidades en % SKUs', total_assigned, skus_processed;
    
    RETURN jsonb_build_object(
        'success', true,
        'venta_id', v_venta_id,
        'total_assigned', total_assigned,
        'skus_processed', skus_processed,
        'message', format('Asignación exitosa: %s unidades en %s SKUs', total_assigned, skus_processed)
    );
END;
$function$;

-- Función: consume_stock_from_reserved (consume desde RESERVADO)
CREATE OR REPLACE FUNCTION public.consume_stock_from_reserved(sale_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_assignment RECORD;
    v_total_consumed INTEGER := 0;
    v_items_count INTEGER := 0;
    v_venta_id TEXT;
BEGIN
    SELECT venta_id INTO v_venta_id FROM ventas WHERE id = sale_id_param;
    
    RAISE LOG '[CONSUME_RESERVED] 🔵 Consumiendo stock reservado para venta %', v_venta_id;
    
    -- Validar que existan asignaciones
    IF NOT EXISTS (SELECT 1 FROM ventas_asignaciones WHERE venta_id = sale_id_param) THEN
        RAISE LOG '[CONSUME_RESERVED] ❌ No existen asignaciones para venta %', v_venta_id;
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No existen asignaciones de stock',
            'code', 'NO_ASSIGNMENTS'
        );
    END IF;
    
    -- Consumir stock de cada asignación
    FOR v_assignment IN 
        SELECT id, stock_id, cantidad_asignada, sku, bin
        FROM ventas_asignaciones
        WHERE venta_id = sale_id_param
    LOOP
        RAISE LOG '[CONSUME_RESERVED]   → Consumiendo SKU % bin %: % unidades', 
            v_assignment.sku, v_assignment.bin, v_assignment.cantidad_asignada;
        
        -- CAMBIO CRÍTICO: Restar de RESERVADO (no de comprometido)
        UPDATE stockxbin
        SET 
            reservado = GREATEST(0, COALESCE(reservado, 0) - v_assignment.cantidad_asignada),
            updated_at = now()
        WHERE id = v_assignment.stock_id;
        
        IF NOT FOUND THEN
            RAISE LOG '[CONSUME_RESERVED]   ❌ Stock record no encontrado: %', v_assignment.stock_id;
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Stock record no encontrado',
                'code', 'STOCK_NOT_FOUND'
            );
        END IF;
        
        v_total_consumed := v_total_consumed + v_assignment.cantidad_asignada;
        v_items_count := v_items_count + 1;
        
        RAISE LOG '[CONSUME_RESERVED]     ✓ Consumido exitosamente';
    END LOOP;
    
    RAISE LOG '[CONSUME_RESERVED] ✅ Consumo exitoso: % unidades en % items', v_total_consumed, v_items_count;
    
    RETURN jsonb_build_object(
        'success', true,
        'total_consumed', v_total_consumed,
        'items_count', v_items_count,
        'message', format('Stock consumido: %s unidades en %s items', v_total_consumed, v_items_count)
    );
END;
$function$;

-- Función: verify_stock_reserved (verifica sin consumir)
CREATE OR REPLACE FUNCTION public.verify_stock_reserved(sale_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_assignment_count INTEGER;
    v_total_units INTEGER;
    v_venta_id TEXT;
BEGIN
    SELECT venta_id INTO v_venta_id FROM ventas WHERE id = sale_id_param;
    
    RAISE LOG '[VERIFY_RESERVED] 🔵 Verificando stock reservado para venta %', v_venta_id;
    
    SELECT 
        COUNT(*),
        COALESCE(SUM(cantidad_asignada), 0)
    INTO v_assignment_count, v_total_units
    FROM ventas_asignaciones
    WHERE venta_id = sale_id_param;
    
    IF v_assignment_count = 0 THEN
        RAISE LOG '[VERIFY_RESERVED] ❌ No hay asignaciones para venta %', v_venta_id;
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No hay asignaciones de stock',
            'code', 'NO_ASSIGNMENTS'
        );
    END IF;
    
    RAISE LOG '[VERIFY_RESERVED] ✅ Stock verificado: % asignaciones, % unidades', 
        v_assignment_count, v_total_units;
    
    RETURN jsonb_build_object(
        'success', true,
        'assignment_count', v_assignment_count,
        'total_units_reserved', v_total_units,
        'next_action', 'Emitir documento - el stock se consumirá al emitir (según tipo)',
        'message', format('Stock reservado correctamente: %s unidades', v_total_units)
    );
END;
$function$;

-- Función: release_sale_reservation (libera reservas)
CREATE OR REPLACE FUNCTION public.release_sale_reservation(sale_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_assignment RECORD;
    v_total_released INTEGER := 0;
    v_items_count INTEGER := 0;
    v_venta_id TEXT;
BEGIN
    SELECT venta_id INTO v_venta_id FROM ventas WHERE id = sale_id_param;
    
    RAISE LOG '[RELEASE_RESERVATION] 🔵 Liberando reservas para venta %', v_venta_id;
    
    -- Liberar cada asignación
    FOR v_assignment IN 
        SELECT id, stock_id, cantidad_asignada, sku, bin
        FROM ventas_asignaciones
        WHERE venta_id = sale_id_param
    LOOP
        RAISE LOG '[RELEASE_RESERVATION]   → Liberando SKU % bin %: % unidades', 
            v_assignment.sku, v_assignment.bin, v_assignment.cantidad_asignada;
        
        -- Mover de reservado a disponibles
        UPDATE stockxbin
        SET 
            disponibles = disponibles + v_assignment.cantidad_asignada,
            reservado = GREATEST(0, COALESCE(reservado, 0) - v_assignment.cantidad_asignada),
            updated_at = now()
        WHERE id = v_assignment.stock_id;
        
        v_total_released := v_total_released + v_assignment.cantidad_asignada;
        v_items_count := v_items_count + 1;
        
        RAISE LOG '[RELEASE_RESERVATION]     ✓ Liberado exitosamente';
    END LOOP;
    
    -- Eliminar asignaciones
    DELETE FROM ventas_asignaciones WHERE venta_id = sale_id_param;
    
    RAISE LOG '[RELEASE_RESERVATION] ✅ Liberación exitosa: % unidades en % items', v_total_released, v_items_count;
    
    RETURN jsonb_build_object(
        'success', true,
        'total_released', v_total_released,
        'items_count', v_items_count,
        'message', format('Reservas liberadas: %s unidades en %s items', v_total_released, v_items_count)
    );
END;
$function$;

-- =================================================================
-- 2. MIGRACIÓN DE DATOS: comprometido → reservado
-- =================================================================

-- Mover stock comprometido a reservado para ventas pendientes
DO $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    RAISE LOG '[MIGRATION] 🔵 Iniciando migración de stock comprometido → reservado';
    
    UPDATE stockxbin
    SET 
        reservado = COALESCE(reservado, 0) + COALESCE(comprometido, 0),
        comprometido = 0,
        updated_at = now()
    WHERE id IN (
        SELECT DISTINCT stock_id 
        FROM ventas_asignaciones va
        JOIN ventas v ON va.venta_id = v.id
        WHERE v.estado IN ('pendiente', 'documento_emitido')
    );
    
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    
    RAISE LOG '[MIGRATION] ✅ Migración completada: % registros actualizados', v_updated_count;
END $$;

-- =================================================================
-- FIN DE MIGRACIÓN
-- =================================================================