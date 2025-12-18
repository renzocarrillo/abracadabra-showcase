-- =====================================================
-- FIX CRÍTICO: Eliminar validación incorrecta de disponibles en consume_picking_libre_stock_strict
-- PROBLEMA: La función valida disponibles cuando el stock ya está RESERVADO
-- SOLUCIÓN: Solo validar que esté reservado, NO validar disponibles
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
  v_session RECORD;
  v_new_version INTEGER;
  v_stock_id UUID;
BEGIN
  -- 1. Obtener sesión con lock
  SELECT * INTO v_session
  FROM picking_libre_sessions
  WHERE id = p_session_id
  FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 'Sesión no encontrada'::TEXT, 0;
    RETURN;
  END IF;

  -- 2. Validar versión (optimistic locking)
  IF p_expected_version IS NOT NULL AND v_session.data_version != p_expected_version THEN
    RETURN QUERY SELECT 
      false, 
      0, 
      format('VERSION_MISMATCH: Esperada %s, Actual %s', p_expected_version, v_session.data_version)::TEXT,
      v_session.data_version;
    RETURN;
  END IF;

  -- 3. Lock explícito de rows de stockxbin ANTES de validaciones
  FOR v_stock_id IN
    SELECT DISTINCT stock_id
    FROM picking_libre_items
    WHERE session_id = p_session_id
  LOOP
    PERFORM 1
    FROM stockxbin
    WHERE id = v_stock_id
    FOR UPDATE NOWAIT;
  END LOOP;

  -- 4. Validar SOLO que stock esté reservado (NO validar disponibles)
  DECLARE
    v_item RECORD;
  BEGIN
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
    LOOP
      -- ✅ Validar que stock está reservado
      IF v_item.reservado < v_item.total_quantity THEN
        RETURN QUERY SELECT 
          false,
          0,
          format('Stock no reservado para SKU %s en bin %s. Reservado: %s, Necesario: %s', 
                 v_item.sku, v_item.bin_code, v_item.reservado, v_item.total_quantity)::TEXT,
          v_session.data_version;
        RETURN;
      END IF;

      -- ❌ REMOVED: Ya no validamos disponibles porque el stock ya está RESERVADO
      -- El stock físico existe (reservado), solo necesitamos moverlo de reservado a consumido
    END LOOP;
  END;

  -- 5. Consolidar cantidades por stock_id y consumir desde RESERVADO
  UPDATE stockxbin s
  SET 
    reservado = reservado - consolidated.total_quantity,
    comprometido = comprometido + consolidated.total_quantity,
    en_existencia = en_existencia - consolidated.total_quantity,
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

  -- 6. Actualizar versión de sesión
  v_new_version := v_session.data_version + 1;
  
  UPDATE picking_libre_sessions
  SET 
    data_version = v_new_version,
    status = 'completado',
    completed_at = now(),
    updated_at = now()
  WHERE id = p_session_id;

  -- 7. Log de auditoría
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

COMMENT ON FUNCTION consume_picking_libre_stock_strict IS 
'FIXED v4: Consume stock desde RESERVADO sin validar disponibles.
Flujo correcto: reserva → reduce reservado, aumenta comprometido, reduce en_existencia.
Ya no valida disponibles porque el stock ya está reservado.';

-- Limpiar sesión fallida reciente
UPDATE picking_libre_sessions
SET 
  status = 'error',
  last_error = 'Error de validación incorrecta - Sistema corregido. Stock reservado no se pudo consumir.',
  updated_at = NOW()
WHERE id = '5308345f-76a6-45f6-bfee-73f14394ec35';