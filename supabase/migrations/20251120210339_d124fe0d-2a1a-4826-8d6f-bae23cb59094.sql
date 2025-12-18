-- =====================================================
-- FIX: reserve_stock_for_session - Prevenir reservas parciales
-- =====================================================
-- PROBLEMA: La función actual permite reservas parciales cuando no hay suficiente stock
-- SOLUCIÓN: Validar TODA la disponibilidad antes de reservar, fallar atómicamente si no hay suficiente

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
  v_is_frozen boolean;
  v_insufficient_items jsonb := '[]'::jsonb;
  v_total_reserved integer := 0;
  v_session_version integer;
BEGIN
  -- ============================================
  -- FASE 1: VALIDACIÓN COMPLETA (sin modificar nada)
  -- ============================================
  
  -- Validar que la sesión existe y está en estado válido
  SELECT data_version INTO v_session_version
  FROM picking_libre_sessions
  WHERE id = p_session_id
    AND status IN ('en_proceso', 'verificando');
  
  IF v_session_version IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Sesión no encontrada o en estado inválido',
      'code', 'INVALID_SESSION'
    );
  END IF;

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
    SELECT disponibles INTO v_available
    FROM stockxbin
    WHERE id = v_stock_id
    FOR UPDATE NOWAIT;  -- Lock pesimista inmediato

    IF v_available IS NULL THEN
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

  RETURN jsonb_build_object(
    'success', true,
    'total_reserved', v_total_reserved,
    'new_version', v_session_version + 1,
    'message', format('Se reservaron %s unidades exitosamente', v_total_reserved)
  );

EXCEPTION
  WHEN lock_not_available THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Otro proceso está modificando el mismo stock. Intente nuevamente.',
      'code', 'LOCK_CONFLICT'
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'code', 'INTERNAL_ERROR'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;