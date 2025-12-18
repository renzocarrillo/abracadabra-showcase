-- =====================================================
-- FIX CRÍTICO: Corregir consumo de stock (Compatible con PostgreSQL)
-- PROBLEMA: FOR UPDATE OF incompatible con GROUP BY
-- SOLUCIÓN: Lock explícito + Subquery en UPDATE
-- =====================================================

-- Recrear función con lock explícito ANTES de UPDATE
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

  -- 3. 🔧 FIX: Lock explícito de rows de stockxbin ANTES de validaciones
  --    Esto evita conflictos con GROUP BY
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

  -- 4. Validar que stock esté reservado y disponible (con cantidades consolidadas)
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
  END;

  -- 5. 🔧 FIX: Consolidar cantidades por stock_id usando subquery
  --    Los locks ya fueron adquiridos en paso 3, ahora es seguro hacer UPDATE
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
'FIXED v2: Lock explícito de stockxbin rows ANTES de UPDATE. 
Resuelve incompatibilidad entre FOR UPDATE OF y GROUP BY.
Consolida cantidades correctamente por stock_id.';

-- =====================================================
-- PREVENCIÓN DE DUPLICACIONES: Constraint único
-- =====================================================

-- Agregar constraint único para prevenir múltiples emisiones completadas por sesión
CREATE UNIQUE INDEX IF NOT EXISTS idx_picking_libre_emissions_unique_completed 
ON picking_libre_emissions (session_id) 
WHERE status = 'completed';

COMMENT ON INDEX idx_picking_libre_emissions_unique_completed IS 
'Previene múltiples emisiones completadas para la misma sesión de picking libre.';