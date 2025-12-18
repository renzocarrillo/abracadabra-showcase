-- =====================================================
-- FIX: Corregir validación de stock en finalize_picking_session_atomic
-- El problema: scan_product_unified mueve stock de disponibles → comprometido
-- Pero finalize validaba contra disponibles (que ya está en 0)
-- Solución: Validar contra comprometido en lugar de disponibles
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

  -- 3. Validar stock COMPROMETIDO para todos los items
  -- IMPORTANTE: El stock ya fue movido de disponibles → comprometido durante el escaneo
  -- por scan_product_unified, así que ahora validamos que comprometido >= cantidad requerida
  WITH stock_validation AS (
    SELECT 
      pli.sku,
      pli.bin_code,
      pli.quantity as requested,
      -- Ahora validamos contra comprometido (donde está el stock reservado para esta sesión)
      COALESCE(s.comprometido, 0) as committed,
      COALESCE(s.disponibles, 0) as available,
      -- El stock es insuficiente si comprometido < cantidad requerida
      (pli.quantity > COALESCE(s.comprometido, 0)) as insufficient,
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
      'committed', committed,
      'available', available,
      'issue', CASE
        WHEN bin_frozen THEN 'Bin congelado'
        WHEN product_frozen THEN 'Producto congelado'
        WHEN insufficient THEN 'Stock comprometido insuficiente'
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
    RAISE LOG '[FINALIZE] Validación de stock EXITOSA - todos los items tienen stock comprometido suficiente';
  END IF;

  -- Si hay problemas de stock, abortar
  IF v_stock_issues IS NOT NULL AND jsonb_array_length(v_stock_issues) > 0 THEN
    RETURN QUERY SELECT 
      false, 
      'en_proceso'::text,
      v_new_version,
      'No se puede finalizar: hay productos con problemas de stock comprometido'::text,
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

COMMENT ON FUNCTION public.finalize_picking_session_atomic IS 
'[v3 - FIX VALIDACION COMPROMETIDO] Finaliza sesión validando stock en columna comprometido (donde scan_product_unified lo reservó), no en disponibles.';