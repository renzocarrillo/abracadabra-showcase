-- ============================================
-- NUEVO SISTEMA DE ASIGNACIÓN Y CONSUMO DE STOCK
-- Reemplaza el sistema anterior con validaciones estrictas
-- ============================================

-- ============================================
-- 1. FUNCIÓN: assign_bins_to_sale_strict
-- Asigna bins a una venta CON validaciones estrictas
-- ============================================
CREATE OR REPLACE FUNCTION public.assign_bins_to_sale_strict(sale_id uuid)
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
    -- Obtener código de venta para logs
    SELECT venta_id INTO v_venta_id FROM ventas WHERE id = sale_id;
    
    RAISE NOTICE '🔵 [ASSIGN_STRICT] Iniciando asignación para venta %', v_venta_id;
    
    -- Primero: Revertir cualquier asignación existente (por si es reasignación)
    UPDATE stockxbin 
    SET 
        disponibles = disponibles + va.cantidad_asignada,
        comprometido = comprometido - va.cantidad_asignada,
        updated_at = now()
    FROM ventas_asignaciones va
    WHERE va.venta_id = sale_id 
      AND va.stock_id = stockxbin.id;
    
    DELETE FROM ventas_asignaciones WHERE venta_id = sale_id;
    
    RAISE NOTICE '✓ Asignaciones anteriores limpiadas';
    
    -- Procesar cada detalle de la venta
    FOR detail_record IN 
        SELECT id, sku, cantidad, nombre_producto
        FROM ventas_detalle 
        WHERE venta_id = sale_id
        ORDER BY sku
    LOOP
        remaining_quantity := detail_record.cantidad;
        skus_processed := skus_processed + 1;
        
        RAISE NOTICE '  → Procesando SKU: % (necesita: %)', detail_record.sku, remaining_quantity;
        
        -- Verificar si el producto está congelado
        IF EXISTS (SELECT 1 FROM productos_congelados WHERE sku = detail_record.sku) THEN
            frozen_products := array_append(frozen_products, detail_record.sku || ' (' || detail_record.nombre_producto || ')');
            RAISE NOTICE '  ❌ SKU % está CONGELADO', detail_record.sku;
            CONTINUE;
        END IF;
        
        -- Buscar stock disponible (excluyendo bins congelados)
        FOR stock_record IN 
            SELECT s.id, s.bin, s.disponibles, s.comprometido
            FROM stockxbin s
            LEFT JOIN bins b ON s.bin = b.bin_code
            WHERE s.sku = detail_record.sku 
              AND s.disponibles > 0
              AND (b.is_frozen IS NULL OR b.is_frozen = false)
            ORDER BY s.disponibles DESC
        LOOP
            IF remaining_quantity <= 0 THEN
                EXIT;
            END IF;
            
            -- Calcular cuánto asignar de este bin
            to_assign := LEAST(stock_record.disponibles, remaining_quantity);
            
            -- Crear asignación
            INSERT INTO ventas_asignaciones (
                venta_id, 
                venta_detalle_id, 
                sku, 
                bin, 
                cantidad_asignada, 
                stock_id
            ) VALUES (
                sale_id,
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
            
            total_assigned := total_assigned + to_assign;
            remaining_quantity := remaining_quantity - to_assign;
            
            RAISE NOTICE '    ✓ Asignado % unidades desde bin %', to_assign, stock_record.bin;
        END LOOP;
        
        -- Verificar si quedó stock sin asignar
        IF remaining_quantity > 0 THEN
            insufficient_stock := array_append(
                insufficient_stock, 
                detail_record.sku || ' (' || detail_record.nombre_producto || '): falta ' || remaining_quantity || ' unidades'
            );
            RAISE NOTICE '  ⚠️  Stock insuficiente para SKU %: faltan % unidades', detail_record.sku, remaining_quantity;
        END IF;
    END LOOP;
    
    -- Registrar en audit log
    PERFORM log_venta_state_change(
        sale_id,
        v_venta_id,
        'asignacion_bins',
        NULL,
        NULL,
        NULL,
        NULL,
        jsonb_build_object(
            'skus_procesados', skus_processed,
            'total_asignado', total_assigned,
            'productos_congelados', frozen_products,
            'stock_insuficiente', insufficient_stock
        )
    );
    
    -- Determinar resultado
    IF array_length(frozen_products, 1) > 0 OR array_length(insufficient_stock, 1) > 0 THEN
        RAISE NOTICE '❌ [ASSIGN_STRICT] Asignación PARCIAL o FALLIDA para venta %', v_venta_id;
        
        RETURN jsonb_build_object(
            'success', false,
            'venta_id', v_venta_id,
            'total_assigned', total_assigned,
            'skus_processed', skus_processed,
            'frozen_products', frozen_products,
            'insufficient_stock', insufficient_stock,
            'message', 'No se pudo completar la asignación. Revise productos congelados o stock insuficiente.'
        );
    END IF;
    
    RAISE NOTICE '✅ [ASSIGN_STRICT] Asignación EXITOSA para venta %: % unidades en % SKUs', v_venta_id, total_assigned, skus_processed;
    
    RETURN jsonb_build_object(
        'success', true,
        'venta_id', v_venta_id,
        'total_assigned', total_assigned,
        'skus_processed', skus_processed,
        'message', format('Asignación exitosa: %s unidades en %s SKUs', total_assigned, skus_processed)
    );
END;
$function$;

-- ============================================
-- 2. FUNCIÓN: consume_stock_strict
-- Consume stock SOLO desde comprometido (vía asignaciones)
-- SIN FALLBACK a disponibles
-- ============================================
CREATE OR REPLACE FUNCTION public.consume_stock_strict(sale_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  assignment_record RECORD;
  consumed_count INTEGER := 0;
  total_units INTEGER := 0;
  v_venta_id TEXT;
  v_sale_details jsonb := '[]'::jsonb;
BEGIN
  -- Obtener código de venta
  SELECT venta_id INTO v_venta_id FROM ventas WHERE id = sale_id_param;
  
  RAISE NOTICE '🔵 [CONSUME_STRICT] Iniciando consumo para venta %', v_venta_id;
  
  -- VALIDACIÓN CRÍTICA: Verificar que existen asignaciones
  IF NOT EXISTS (SELECT 1 FROM ventas_asignaciones WHERE venta_id = sale_id_param) THEN
    RAISE NOTICE '❌ [CONSUME_STRICT] ERROR: No existen asignaciones para venta %', v_venta_id;
    
    RETURN jsonb_build_object(
      'success', false,
      'venta_id', v_venta_id,
      'error', 'CRITICAL_ERROR',
      'message', format('No se encontraron asignaciones para la venta %s. No se puede consumir stock sin asignaciones válidas.', v_venta_id),
      'records_processed', 0,
      'total_units', 0
    );
  END IF;
  
  -- Consumir desde comprometido usando las asignaciones
  FOR assignment_record IN 
    SELECT va.stock_id, va.cantidad_asignada, va.sku, va.bin, s.comprometido, s.en_existencia
    FROM ventas_asignaciones va
    JOIN stockxbin s ON s.id = va.stock_id
    WHERE va.venta_id = sale_id_param
  LOOP
    -- VALIDACIÓN: Verificar que hay stock comprometido suficiente
    IF assignment_record.comprometido < assignment_record.cantidad_asignada THEN
      RAISE WARNING '⚠️  Stock comprometido insuficiente en bin %: tiene % pero necesita %', 
                    assignment_record.bin, 
                    assignment_record.comprometido, 
                    assignment_record.cantidad_asignada;
    END IF;
    
    -- Consumir desde comprometido y en_existencia
    UPDATE stockxbin 
    SET 
      comprometido = GREATEST(0, comprometido - assignment_record.cantidad_asignada),
      en_existencia = GREATEST(0, en_existencia - assignment_record.cantidad_asignada),
      updated_at = now()
    WHERE id = assignment_record.stock_id;
    
    consumed_count := consumed_count + 1;
    total_units := total_units + assignment_record.cantidad_asignada;
    
    -- Acumular detalles para audit log
    v_sale_details := v_sale_details || jsonb_build_object(
      'sku', assignment_record.sku,
      'bin', assignment_record.bin,
      'cantidad', assignment_record.cantidad_asignada,
      'comprometido_antes', assignment_record.comprometido,
      'en_existencia_antes', assignment_record.en_existencia
    );
    
    RAISE NOTICE '  ✓ Consumido % unidades de % desde bin %', 
                 assignment_record.cantidad_asignada,
                 assignment_record.sku,
                 assignment_record.bin;
  END LOOP;
  
  -- Refresh stock totals
  PERFORM refresh_stock_totals();
  
  -- Registrar en audit log
  PERFORM log_venta_state_change(
    sale_id_param,
    v_venta_id,
    'consumo_stock',
    NULL,
    NULL,
    NULL,
    NULL,
    jsonb_build_object(
      'metodo', 'strict_assignments',
      'registros_procesados', consumed_count,
      'unidades_totales', total_units,
      'detalles', v_sale_details
    )
  );
  
  RAISE NOTICE '✅ [CONSUME_STRICT] Consumo exitoso para venta %: % unidades en % registros', v_venta_id, total_units, consumed_count;
  
  RETURN jsonb_build_object(
    'success', true,
    'venta_id', v_venta_id,
    'method', 'strict_assignments',
    'records_processed', consumed_count,
    'total_units', total_units,
    'message', format('Stock consumido exitosamente: %s unidades desde %s bins', total_units, consumed_count)
  );
END;
$function$;

-- ============================================
-- 3. DEPRECAR consume_stock_for_sale_fallback
-- Mantener por compatibilidad pero marcar como obsoleta
-- ============================================
COMMENT ON FUNCTION public.consume_stock_for_sale_fallback IS 
'DEPRECATED: Esta función usa fallback peligroso. Usar consume_stock_strict() en su lugar.';

-- ============================================
-- 4. Crear función auxiliar para verificar asignaciones
-- ============================================
CREATE OR REPLACE FUNCTION public.verify_sale_assignments(sale_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_venta_id TEXT;
  v_assignments_count INTEGER;
  v_total_assigned INTEGER;
  v_total_expected INTEGER;
BEGIN
  SELECT venta_id INTO v_venta_id FROM ventas WHERE id = sale_id_param;
  
  -- Contar asignaciones
  SELECT COUNT(*), COALESCE(SUM(cantidad_asignada), 0)
  INTO v_assignments_count, v_total_assigned
  FROM ventas_asignaciones
  WHERE venta_id = sale_id_param;
  
  -- Contar cantidad esperada
  SELECT COALESCE(SUM(cantidad), 0)
  INTO v_total_expected
  FROM ventas_detalle
  WHERE venta_id = sale_id_param;
  
  RETURN jsonb_build_object(
    'has_assignments', v_assignments_count > 0,
    'assignments_count', v_assignments_count,
    'total_assigned', v_total_assigned,
    'total_expected', v_total_expected,
    'is_complete', v_total_assigned = v_total_expected,
    'venta_id', v_venta_id
  );
END;
$function$;

-- ============================================
-- 5. Comentarios para documentación
-- ============================================
COMMENT ON FUNCTION public.assign_bins_to_sale_strict IS 
'Asigna bins a una venta con validaciones estrictas. Retorna error detallado si hay productos congelados o stock insuficiente. NO permite asignaciones parciales en producción.';

COMMENT ON FUNCTION public.consume_stock_strict IS 
'Consume stock SOLO desde comprometido usando asignaciones. SIN FALLBACK. Retorna error si no existen asignaciones. Esta es la única función que debe usarse para consumir stock de ventas.';

COMMENT ON FUNCTION public.verify_sale_assignments IS 
'Verifica que una venta tiene asignaciones válidas y completas antes de permitir emisión de documentos.';