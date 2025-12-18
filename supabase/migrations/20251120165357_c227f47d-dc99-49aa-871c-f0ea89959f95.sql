-- =====================================================
-- FIX: Consumo de Stock por Stock_ID (No por Item Individual)
-- PROBLEMA: Cuando hay múltiples items con mismo stock_id, solo se consumía 1 unidad
-- SOLUCIÓN: Consolidar cantidades por stock_id ANTES de actualizar
-- =====================================================

CREATE OR REPLACE FUNCTION consume_picking_libre_stock_strict(
  p_session_id UUID,
  p_expected_version INTEGER DEFAULT NULL
) RETURNS TABLE (
  success BOOLEAN,
  items_updated INTEGER,
  error_message TEXT,
  new_version INTEGER
) AS $$
DECLARE
  v_updated INTEGER := 0;
  v_item RECORD;
  v_session RECORD;
  v_new_version INTEGER;
BEGIN
  -- Obtener sesión con lock
  SELECT * INTO v_session
  FROM picking_libre_sessions
  WHERE id = p_session_id
  FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 'Sesión no encontrada'::TEXT, 0;
    RETURN;
  END IF;

  -- Validar versión (optimistic locking)
  IF p_expected_version IS NOT NULL AND v_session.data_version != p_expected_version THEN
    RETURN QUERY SELECT 
      false, 
      0, 
      format('VERSION_MISMATCH: Esperada %s, Actual %s', p_expected_version, v_session.data_version)::TEXT,
      v_session.data_version;
    RETURN;
  END IF;

  -- Verificar que todo el stock esté reservado (con cantidades consolidadas)
  FOR v_item IN
    SELECT 
      pli.stock_id,
      pli.sku,
      pli.bin_code,
      SUM(pli.quantity) as total_quantity,
      s.disponibles, 
      s.reservado, 
      s.comprometido
    FROM picking_libre_items pli
    JOIN stockxbin s ON s.id = pli.stock_id
    WHERE pli.session_id = p_session_id
    GROUP BY pli.stock_id, pli.sku, pli.bin_code, s.disponibles, s.reservado, s.comprometido
    FOR UPDATE OF s NOWAIT
  LOOP
    -- Validar que stock está reservado
    IF v_item.reservado < v_item.total_quantity THEN
      RETURN QUERY SELECT 
        false,
        0,
        format('Stock no reservado para SKU %s en bin %s. Reservado: %s, Necesario: %s', 
               v_item.sku, v_item.bin_code, v_item.reservado, v_item.total_quantity)::TEXT,
        v_session.data_version;
      RETURN;
    END IF;

    -- Validar disponibilidad
    IF v_item.disponibles < v_item.total_quantity THEN
      RETURN QUERY SELECT 
        false,
        0,
        format('Stock insuficiente para SKU %s en bin %s. Disponible: %s, Necesario: %s', 
               v_item.sku, v_item.bin_code, v_item.disponibles, v_item.total_quantity)::TEXT,
        v_session.data_version;
      RETURN;
    END IF;
  END LOOP;

  -- 🔧 FIX CRÍTICO: Consolidar cantidades por stock_id ANTES de actualizar
  -- Esto asegura que si hay 18 items del mismo SKU/bin, se consuman las 18 unidades
  UPDATE stockxbin s
  SET 
    disponibles = disponibles - consolidated.total_quantity,
    reservado = reservado - consolidated.total_quantity,
    comprometido = GREATEST(0, comprometido - consolidated.total_quantity),
    updated_at = now()
  FROM (
    SELECT 
      stock_id, 
      SUM(quantity) as total_quantity
    FROM picking_libre_items
    WHERE session_id = p_session_id
    GROUP BY stock_id
  ) consolidated
  WHERE s.id = consolidated.stock_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- Actualizar versión de sesión
  v_new_version := v_session.data_version + 1;
  
  UPDATE picking_libre_sessions
  SET 
    data_version = v_new_version,
    status = 'completado',
    completed_at = now(),
    updated_at = now()
  WHERE id = p_session_id;

  -- Log de auditoría
  INSERT INTO picking_libre_audit_log (
    session_id,
    event_type,
    event_status,
    details
  ) VALUES (
    p_session_id,
    'STOCK_CONSUMED_STRICT',
    'success',
    jsonb_build_object(
      'items_updated', v_updated,
      'version', v_new_version,
      'timestamp', now()
    )
  );

  RETURN QUERY SELECT true, v_updated, NULL::TEXT, v_new_version;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentario explicativo del fix
COMMENT ON FUNCTION consume_picking_libre_stock_strict IS 
'FIXED: Consolida cantidades por stock_id antes de consumir. 
Resuelve bug donde múltiples items del mismo SKU/bin solo consumían 1 unidad.';
