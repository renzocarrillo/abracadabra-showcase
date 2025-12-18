-- =====================================================
-- FIX: Permitir reserva de stock en estado 'emitiendo'
-- =====================================================
-- 
-- PROBLEMA: reserve_stock_for_session solo acepta estados 'en_proceso' y 'verificando',
-- pero finalize_picking_session_atomic cambia el estado a 'emitiendo' ANTES de que
-- se llame a reserve_stock_for_session, causando error INVALID_SESSION.
--
-- SOLUCIÓN: Agregar 'emitiendo' a los estados válidos para reservar stock.
-- =====================================================

DROP FUNCTION IF EXISTS reserve_stock_for_session(uuid, jsonb, uuid, text);

CREATE OR REPLACE FUNCTION reserve_stock_for_session(
  p_session_id uuid,
  p_items jsonb,
  p_user_id uuid,
  p_user_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_sku text;
  v_bin text;
  v_quantity integer;
  v_stock_id uuid;
  v_available integer;
  v_session_version integer;
  v_total_reserved integer := 0;
  v_insufficient_items jsonb := '[]'::jsonb;
  v_frozen_bins jsonb := '[]'::jsonb;
  v_frozen_products jsonb := '[]'::jsonb;
BEGIN
  RAISE LOG '[RESERVE_STOCK] ============================================';
  RAISE LOG '[RESERVE_STOCK] INICIO - Session: %, User: %, Items: %', 
    p_session_id, p_user_name, jsonb_array_length(p_items);

  -- Validar que la sesión existe y está en estado válido
  -- CAMBIO CRÍTICO: Ahora también acepta 'emitiendo'
  SELECT data_version INTO v_session_version
  FROM picking_libre_sessions
  WHERE id = p_session_id
    AND status IN ('en_proceso', 'verificando', 'emitiendo');
  
  IF v_session_version IS NULL THEN
    RAISE LOG '[RESERVE_STOCK] ERROR: Sesión no encontrada o estado inválido';
    
    -- Log adicional para debugging
    DECLARE
      v_actual_status text;
    BEGIN
      SELECT status INTO v_actual_status
      FROM picking_libre_sessions
      WHERE id = p_session_id;
      
      IF v_actual_status IS NOT NULL THEN
        RAISE LOG '[RESERVE_STOCK] ERROR: Sesión existe pero estado es: %', v_actual_status;
      ELSE
        RAISE LOG '[RESERVE_STOCK] ERROR: Sesión no existe en DB';
      END IF;
    END;
    
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

    RAISE LOG '[RESERVE_STOCK] Validando item - SKU: %, Bin: %, Qty: %, StockID: %', 
      v_sku, v_bin, v_quantity, v_stock_id;

    -- Verificar si el bin está congelado
    IF EXISTS (SELECT 1 FROM bins WHERE bin_code = v_bin AND is_frozen = true) THEN
      RAISE LOG '[RESERVE_STOCK] ERROR: Bin congelado - %', v_bin;
      v_frozen_bins := v_frozen_bins || jsonb_build_object(
        'sku', v_sku,
        'bin', v_bin,
        'quantity', v_quantity
      );
      CONTINUE;
    END IF;

    -- Verificar si el producto está congelado
    IF EXISTS (SELECT 1 FROM productos_congelados WHERE sku = v_sku) THEN
      RAISE LOG '[RESERVE_STOCK] ERROR: Producto congelado - %', v_sku;
      v_frozen_products := v_frozen_products || jsonb_build_object(
        'sku', v_sku,
        'bin', v_bin,
        'quantity', v_quantity
      );
      CONTINUE;
    END IF;

    -- Verificar disponibilidad
    SELECT disponibles INTO v_available
    FROM stockxbin
    WHERE id = v_stock_id;

    RAISE LOG '[RESERVE_STOCK] Stock disponible para %: % (necesario: %)', 
      v_sku, COALESCE(v_available, 0), v_quantity;

    IF v_available IS NULL OR v_available < v_quantity THEN
      RAISE LOG '[RESERVE_STOCK] ERROR: Stock insuficiente - SKU: %, Disponible: %, Necesario: %',
        v_sku, COALESCE(v_available, 0), v_quantity;
      v_insufficient_items := v_insufficient_items || jsonb_build_object(
        'sku', v_sku,
        'bin', v_bin,
        'available', COALESCE(v_available, 0),
        'needed', v_quantity
      );
      CONTINUE;
    END IF;
  END LOOP;

  -- Si hay algún error de validación, devolver error
  IF jsonb_array_length(v_frozen_bins) > 0 THEN
    RAISE LOG '[RESERVE_STOCK] ABORT: Bins congelados detectados';
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Algunos bins están congelados',
      'code', 'FROZEN_BINS',
      'details', jsonb_build_object('frozen_bins', v_frozen_bins)
    );
  END IF;

  IF jsonb_array_length(v_frozen_products) > 0 THEN
    RAISE LOG '[RESERVE_STOCK] ABORT: Productos congelados detectados';
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Algunos productos están congelados',
      'code', 'FROZEN_PRODUCTS',
      'details', jsonb_build_object('frozen_products', v_frozen_products)
    );
  END IF;

  IF jsonb_array_length(v_insufficient_items) > 0 THEN
    RAISE LOG '[RESERVE_STOCK] ABORT: Stock insuficiente detectado';
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Stock insuficiente para algunos productos',
      'code', 'INSUFFICIENT_STOCK',
      'details', jsonb_build_object('insufficient_items', v_insufficient_items)
    );
  END IF;

  RAISE LOG '[RESERVE_STOCK] Validación completa OK - Iniciando reservas...';

  -- Si todas las validaciones pasaron, realizar las reservas
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_sku := v_item->>'sku';
    v_bin := v_item->>'bin';
    v_quantity := (v_item->>'quantity')::integer;
    v_stock_id := (v_item->>'stock_id')::uuid;

    RAISE LOG '[RESERVE_STOCK] Reservando - SKU: %, Bin: %, Qty: %', v_sku, v_bin, v_quantity;

    -- Reservar stock (disponibles -> reservado)
    UPDATE stockxbin
    SET 
      disponibles = disponibles - v_quantity,
      reservado = COALESCE(reservado, 0) + v_quantity,
      updated_at = now()
    WHERE id = v_stock_id;

    v_total_reserved := v_total_reserved + v_quantity;
    
    RAISE LOG '[RESERVE_STOCK] Reservado exitosamente - Total acumulado: %', v_total_reserved;
  END LOOP;

  -- Log de auditoría
  INSERT INTO picking_libre_audit_log (
    session_id,
    event_type,
    event_status,
    user_id,
    user_name,
    details
  ) VALUES (
    p_session_id,
    'STOCK_RESERVED',
    'success',
    p_user_id,
    p_user_name,
    jsonb_build_object(
      'total_reserved', v_total_reserved,
      'items_count', jsonb_array_length(p_items),
      'items', p_items
    )
  );

  RAISE LOG '[RESERVE_STOCK] ============================================';
  RAISE LOG '[RESERVE_STOCK] COMPLETADO - Total reservado: % unidades', v_total_reserved;

  RETURN jsonb_build_object(
    'success', true,
    'total_reserved', v_total_reserved,
    'message', format('Stock reservado exitosamente: %s unidades', v_total_reserved)
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG '[RESERVE_STOCK] EXCEPTION: % - %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'code', 'INTERNAL_ERROR'
    );
END;
$$;

-- =====================================================
-- COMENTARIO ACTUALIZADO
-- =====================================================

COMMENT ON FUNCTION reserve_stock_for_session IS 
'[v3 - FIX INVALID_SESSION] Reserva stock atómicamente con validación completa previa. 
ACEPTA estados: en_proceso, verificando, emitiendo (FIX para permitir reserva después de finalize).
NO permite reservas parciales. Logging detallado con prefijo [RESERVE_STOCK]';