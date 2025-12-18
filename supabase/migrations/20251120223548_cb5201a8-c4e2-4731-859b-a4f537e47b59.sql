-- =====================================================
-- LOGS DETALLADOS PARA DEBUGGING DE PICKING LIBRE
-- =====================================================
-- Paso 1: Eliminar versión antigua de reserve_stock_for_session
-- Paso 2: Recrear con logs detallados

-- =====================================================
-- 1. ELIMINAR VERSIÓN ANTIGUA (sin parámetros p_items)
-- =====================================================

-- Esta es la versión problemática que permite reservas parciales
DROP FUNCTION IF EXISTS reserve_stock_for_session(uuid);

-- =====================================================
-- 2. AGREGAR LOGS A finalize_picking_session_atomic
-- =====================================================

CREATE OR REPLACE FUNCTION public.finalize_picking_session_atomic(
  p_session_id uuid,
  p_expected_version integer,
  p_documento_tipo text,
  p_tienda_destino_id uuid,
  p_transportista_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  new_status text,
  new_version integer,
  error_message text,
  stock_errors jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status text;
  v_lock_result record;
  v_stock_issues jsonb := '[]'::jsonb;
  v_insufficient_stock boolean := false;
  v_new_version integer;
  v_items_count integer;
BEGIN
  -- LOG: Inicio de finalización
  SELECT COUNT(*) INTO v_items_count FROM picking_libre_items WHERE session_id = p_session_id;
  RAISE LOG '[FINALIZE] INICIO - Session: %, Expected Version: %, Items Count: %, Documento: %', 
    p_session_id, p_expected_version, v_items_count, p_documento_tipo;

  -- 1. Verificar lock y versión
  SELECT * INTO v_lock_result
  FROM update_session_with_lock(p_session_id, p_expected_version, '{}'::jsonb);

  RAISE LOG '[FINALIZE] Lock result - Success: %, New Version: %, Error: %',
    v_lock_result.success, v_lock_result.new_version, v_lock_result.error_message;

  IF NOT v_lock_result.success THEN
    RETURN QUERY SELECT 
      false, 
      NULL::text, 
      0,
      v_lock_result.error_message,
      NULL::jsonb;
    RETURN;
  END IF;

  v_new_version := v_lock_result.new_version;

  -- 2. Verificar estado actual
  SELECT status INTO v_current_status
  FROM picking_libre_sessions
  WHERE id = p_session_id;

  RAISE LOG '[FINALIZE] Estado actual de sesión: %', v_current_status;

  -- Validar que esté en estado correcto
  IF v_current_status NOT IN ('en_proceso', 'verificado') THEN
    RAISE LOG '[FINALIZE] ERROR: Estado inválido para finalizar: %', v_current_status;
    RETURN QUERY SELECT 
      false,
      v_current_status,
      v_new_version,
      format('Sesión en estado inválido para finalizar: %s', v_current_status)::text,
      NULL::jsonb;
    RETURN;
  END IF;

  -- 3. Validar stock disponible para todos los items
  WITH stock_validation AS (
    SELECT 
      pli.sku,
      pli.bin_code,
      pli.quantity as requested,
      COALESCE(s.disponibles, 0) as available,
      (pli.quantity > COALESCE(s.disponibles, 0)) as insufficient,
      COALESCE(b.is_frozen, false) as bin_frozen,
      EXISTS(
        SELECT 1 FROM productos_congelados pc 
        WHERE pc.sku = pli.sku
      ) as product_frozen
    FROM picking_libre_items pli
    LEFT JOIN stockxbin s ON s.id = pli.stock_id
    LEFT JOIN bins b ON b.bin_code = pli.bin_code
    WHERE pli.session_id = p_session_id
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'sku', sku,
      'bin', bin_code,
      'requested', requested,
      'available', available,
      'issue', CASE
        WHEN bin_frozen THEN 'Bin congelado'
        WHEN product_frozen THEN 'Producto congelado'
        WHEN insufficient THEN 'Stock insuficiente'
        ELSE 'Otro'
      END
    )
  )
  INTO v_stock_issues
  FROM stock_validation
  WHERE insufficient OR bin_frozen OR product_frozen;

  IF v_stock_issues IS NOT NULL THEN
    RAISE LOG '[FINALIZE] PROBLEMAS DE STOCK DETECTADOS: %', v_stock_issues;
  ELSE
    RAISE LOG '[FINALIZE] Validación de stock EXITOSA - todos los items tienen stock suficiente';
  END IF;

  -- Si hay problemas de stock, abortar
  IF v_stock_issues IS NOT NULL AND jsonb_array_length(v_stock_issues) > 0 THEN
    RETURN QUERY SELECT 
      false, 
      'en_proceso'::text,
      v_new_version,
      'No se puede finalizar: hay productos con problemas de stock'::text,
      v_stock_issues;
    RETURN;
  END IF;

  -- 4. Actualizar a estado "emitiendo" (previene doble emisión)
  UPDATE picking_libre_sessions
  SET 
    status = 'emitiendo',
    documento_tipo = p_documento_tipo,
    tienda_destino_id = p_tienda_destino_id,
    transportista_id = p_transportista_id,
    notes = p_notes,
    data_version = v_new_version + 1,
    last_activity_at = now(),
    updated_at = now()
  WHERE id = p_session_id;

  v_new_version := v_new_version + 1;

  RAISE LOG '[FINALIZE] Sesión actualizada a estado EMITIENDO - Nueva versión: %', v_new_version;

  -- 5. Log del evento
  INSERT INTO picking_libre_audit_log (
    session_id, 
    event_type, 
    event_status,
    details
  ) VALUES (
    p_session_id,
    'FINALIZATION_STARTED',
    'success',
    jsonb_build_object(
      'documento_tipo', p_documento_tipo,
      'tienda_destino_id', p_tienda_destino_id,
      'transportista_id', p_transportista_id,
      'version', v_new_version,
      'items_count', v_items_count
    )
  );

  RAISE LOG '[FINALIZE] COMPLETADO EXITOSAMENTE - Version final: %', v_new_version;

  RETURN QUERY SELECT 
    true, 
    'emitiendo'::text,
    v_new_version,
    NULL::text,
    NULL::jsonb;
    
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG '[FINALIZE] EXCEPTION: % - %', SQLERRM, SQLSTATE;
    -- Log del error
    INSERT INTO picking_libre_audit_log (
      session_id, 
      event_type, 
      event_status,
      error_message,
      details
    ) VALUES (
      p_session_id,
      'FINALIZATION_ERROR',
      'error',
      SQLERRM,
      jsonb_build_object(
        'sqlstate', SQLSTATE,
        'version', p_expected_version
      )
    );
    
    RETURN QUERY SELECT 
      false,
      NULL::text,
      0,
      format('Error inesperado: %s', SQLERRM)::text,
      NULL::jsonb;
END;
$$;

-- =====================================================
-- 3. AGREGAR LOGS A reserve_stock_for_session (VERSIÓN NUEVA)
-- =====================================================

CREATE OR REPLACE FUNCTION reserve_stock_for_session(
  p_session_id uuid,
  p_items jsonb,
  p_user_id uuid,
  p_user_name text
)
RETURNS jsonb AS $$
DECLARE
  v_item jsonb;
  v_sku text;
  v_bin text;
  v_quantity integer;
  v_stock_id uuid;
  v_available integer;
  v_reservado_actual integer;
  v_is_frozen boolean;
  v_insufficient_items jsonb := '[]'::jsonb;
  v_total_reserved integer := 0;
  v_session_version integer;
  v_items_count integer;
BEGIN
  -- LOG: Identificar versión de función
  v_items_count := jsonb_array_length(p_items);
  RAISE LOG '[RESERVE_STOCK] NUEVA VERSIÓN (con p_items) INICIADA - Session: %, Items: %, User: %', 
    p_session_id, v_items_count, p_user_name;

  -- ============================================
  -- FASE 1: VALIDACIÓN COMPLETA (sin modificar nada)
  -- ============================================
  
  -- Validar que la sesión existe y está en estado válido
  SELECT data_version INTO v_session_version
  FROM picking_libre_sessions
  WHERE id = p_session_id
    AND status IN ('en_proceso', 'verificando');
  
  IF v_session_version IS NULL THEN
    RAISE LOG '[RESERVE_STOCK] ERROR: Sesión no encontrada o estado inválido';
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Sesión no encontrada o en estado inválido',
      'code', 'INVALID_SESSION'
    );
  END IF;

  RAISE LOG '[RESERVE_STOCK] Sesión válida - Version actual: %', v_session_version;

  -- Validar CADA item ANTES de hacer cualquier modificación
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_sku := v_item->>'sku';
    v_bin := v_item->>'bin';
    v_quantity := (v_item->>'quantity')::integer;
    v_stock_id := (v_item->>'stock_id')::uuid;

    -- Verificar si el producto o bin están congelados
    SELECT 
      COALESCE(b.is_frozen, false) OR 
      EXISTS(SELECT 1 FROM productos_congelados WHERE sku = v_sku)
    INTO v_is_frozen
    FROM stockxbin s
    LEFT JOIN bins b ON b.bin_code = s.bin
    WHERE s.id = v_stock_id;

    IF v_is_frozen THEN
      RAISE LOG '[RESERVE_STOCK] ERROR: Item congelado - SKU: %, Bin: %', v_sku, v_bin;
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Producto %s o bin %s está congelado', v_sku, v_bin),
        'code', 'FROZEN_ITEM',
        'details', jsonb_build_object(
          'sku', v_sku,
          'bin', v_bin
        )
      );
    END IF;

    -- Verificar stock disponible (CON LOCK para prevenir race conditions)
    SELECT disponibles, reservado INTO v_available, v_reservado_actual
    FROM stockxbin
    WHERE id = v_stock_id
    FOR UPDATE NOWAIT;

    RAISE LOG '[RESERVE_STOCK] Validando - SKU: %, Bin: %, Necesario: %, Disponible: %, Reservado actual: %',
      v_sku, v_bin, v_quantity, v_available, v_reservado_actual;

    IF v_available IS NULL THEN
      RAISE LOG '[RESERVE_STOCK] ERROR: Stock no encontrado - SKU: %, Bin: %, Stock ID: %', v_sku, v_bin, v_stock_id;
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Stock no encontrado para SKU %s en bin %s', v_sku, v_bin),
        'code', 'STOCK_NOT_FOUND',
        'details', jsonb_build_object(
          'sku', v_sku,
          'bin', v_bin,
          'stock_id', v_stock_id
        )
      );
    END IF;

    -- CRÍTICO: Validar que hay suficiente stock disponible
    IF v_available < v_quantity THEN
      RAISE LOG '[RESERVE_STOCK] ❌ STOCK INSUFICIENTE - SKU: %, Necesario: %, Disponible: %, Faltante: %',
        v_sku, v_quantity, v_available, (v_quantity - v_available);
      
      v_insufficient_items := v_insufficient_items || jsonb_build_object(
        'sku', v_sku,
        'bin', v_bin,
        'needed', v_quantity,
        'available', v_available,
        'missing', v_quantity - v_available
      );
    END IF;
  END LOOP;

  -- Si hay items con stock insuficiente, FALLAR COMPLETAMENTE
  IF jsonb_array_length(v_insufficient_items) > 0 THEN
    RAISE LOG '[RESERVE_STOCK] ❌ FALLO TOTAL - Items con stock insuficiente: %', v_insufficient_items;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Stock insuficiente para completar la reserva',
      'code', 'INSUFFICIENT_STOCK',
      'details', jsonb_build_object(
        'insufficient_items', v_insufficient_items,
        'message', 'No se puede hacer reserva parcial. Se requiere stock completo para todos los items.'
      )
    );
  END IF;

  RAISE LOG '[RESERVE_STOCK] ✅ Todas las validaciones PASARON - Iniciando reserva de stock';

  -- ============================================
  -- FASE 2: RESERVAR STOCK (solo si TODO pasó validación)
  -- ============================================
  
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_sku := v_item->>'sku';
    v_bin := v_item->>'bin';
    v_quantity := (v_item->>'quantity')::integer;
    v_stock_id := (v_item->>'stock_id')::uuid;

    -- Actualizar stock: mover de disponibles a reservado
    UPDATE stockxbin
    SET 
      disponibles = disponibles - v_quantity,
      reservado = reservado + v_quantity,
      updated_at = now()
    WHERE id = v_stock_id;

    v_total_reserved := v_total_reserved + v_quantity;

    RAISE LOG '[RESERVE_STOCK] ✅ Reservado - SKU: %, Bin: %, Cantidad: %, Stock ID: %',
      v_sku, v_bin, v_quantity, v_stock_id;

    -- Log de auditoría
    INSERT INTO picking_libre_audit_log (
      session_id,
      user_id,
      user_name,
      event_type,
      event_status,
      details
    ) VALUES (
      p_session_id,
      p_user_id,
      p_user_name,
      'STOCK_RESERVED',
      'success',
      jsonb_build_object(
        'sku', v_sku,
        'bin', v_bin,
        'quantity', v_quantity,
        'stock_id', v_stock_id
      )
    );
  END LOOP;

  -- Actualizar versión de la sesión (optimistic locking)
  UPDATE picking_libre_sessions
  SET 
    data_version = data_version + 1,
    status = 'emitiendo',
    last_activity_at = now(),
    updated_at = now()
  WHERE id = p_session_id;

  RAISE LOG '[RESERVE_STOCK] ✅ COMPLETADO - Total reservado: %, Nueva versión: %',
    v_total_reserved, (v_session_version + 1);

  RETURN jsonb_build_object(
    'success', true,
    'total_reserved', v_total_reserved,
    'new_version', v_session_version + 1,
    'message', format('Se reservaron %s unidades exitosamente', v_total_reserved)
  );

EXCEPTION
  WHEN lock_not_available THEN
    RAISE LOG '[RESERVE_STOCK] ❌ EXCEPTION: Lock no disponible - Conflicto con otro proceso';
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Otro proceso está modificando el mismo stock. Intente nuevamente.',
      'code', 'LOCK_CONFLICT'
    );
  WHEN OTHERS THEN
    RAISE LOG '[RESERVE_STOCK] ❌ EXCEPTION: % - %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'code', 'INTERNAL_ERROR'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 4. COMENTARIOS Y DOCUMENTACIÓN
-- =====================================================

COMMENT ON FUNCTION public.finalize_picking_session_atomic IS 
'[v2 CON LOGS] Finaliza sesión de forma atómica con validaciones exhaustivas y logging detallado para debugging. Los logs aparecen en Postgres logs con prefijo [FINALIZE]';

COMMENT ON FUNCTION reserve_stock_for_session IS 
'[v2 CON LOGS] Reserva stock atómicamente con validación completa previa y logging detallado. NO permite reservas parciales. Los logs aparecen en Postgres logs con prefijo [RESERVE_STOCK]';