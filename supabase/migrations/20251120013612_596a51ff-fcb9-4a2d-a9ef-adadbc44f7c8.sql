-- =====================================================
-- FASE 5: VALIDACIÓN DE STOCK CON RESERVAS
-- =====================================================
-- Implementa sistema de reserva de stock antes de emisión
-- para prevenir problemas de disponibilidad durante el proceso

-- =====================================================
-- 1. AGREGAR COLUMNA DE RESERVAS
-- =====================================================

-- Agregar columna reservado a stockxbin
ALTER TABLE stockxbin ADD COLUMN IF NOT EXISTS reservado INTEGER DEFAULT 0;

-- Constraint: reservado debe ser válido
ALTER TABLE stockxbin ADD CONSTRAINT check_reservado_valid 
  CHECK (reservado >= 0 AND reservado <= disponibles);

-- Índice para consultas de stock disponible (no reservado)
CREATE INDEX IF NOT EXISTS idx_stockxbin_disponible_no_reservado 
  ON stockxbin((disponibles - reservado)) WHERE (disponibles - reservado) > 0;

-- =====================================================
-- 2. FUNCIÓN DE RESERVA DE STOCK
-- =====================================================

CREATE OR REPLACE FUNCTION reserve_stock_for_session(
  p_session_id UUID
) RETURNS TABLE (
  success BOOLEAN,
  error_message TEXT,
  items_reserved INTEGER
) AS $$
DECLARE
  v_item RECORD;
  v_items_count INTEGER := 0;
  v_available_stock INTEGER;
BEGIN
  -- Iterar sobre items de la sesión
  FOR v_item IN 
    SELECT pli.*, s.disponibles, s.reservado, s.comprometido
    FROM picking_libre_items pli
    JOIN stockxbin s ON s.id = pli.stock_id
    WHERE pli.session_id = p_session_id
    FOR UPDATE OF s NOWAIT  -- Lock para prevenir race conditions
  LOOP
    -- Calcular stock realmente disponible
    v_available_stock := v_item.disponibles - v_item.reservado;
    
    -- Verificar que haya stock suficiente sin reservar
    IF v_available_stock < v_item.quantity THEN
      RETURN QUERY SELECT 
        false,
        format('Stock insuficiente: SKU %s en bin %s. Disponible: %s, Necesario: %s', 
               v_item.sku, v_item.bin_code, v_available_stock, v_item.quantity)::TEXT,
        0;
      RETURN;
    END IF;

    -- Reservar el stock
    UPDATE stockxbin
    SET 
      reservado = reservado + v_item.quantity,
      updated_at = now()
    WHERE id = v_item.stock_id;
    
    v_items_count := v_items_count + 1;
    
    RAISE NOTICE 'Reservado: SKU % en bin % - Cantidad: %', 
                 v_item.sku, v_item.bin_code, v_item.quantity;
  END LOOP;

  -- Registrar en audit log
  INSERT INTO picking_libre_audit_log (
    session_id,
    event_type,
    event_status,
    details
  ) VALUES (
    p_session_id,
    'STOCK_RESERVED',
    'success',
    jsonb_build_object(
      'items_reserved', v_items_count,
      'timestamp', now()
    )
  );

  RETURN QUERY SELECT true, NULL::TEXT, v_items_count;
  
EXCEPTION
  WHEN lock_not_available THEN
    RETURN QUERY SELECT 
      false,
      'Stock bloqueado por otra operación. Intente nuevamente.'::TEXT,
      0;
  WHEN OTHERS THEN
    RETURN QUERY SELECT 
      false,
      format('Error al reservar stock: %s', SQLERRM)::TEXT,
      0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 3. FUNCIÓN DE LIBERACIÓN DE RESERVA
-- =====================================================

CREATE OR REPLACE FUNCTION release_stock_reservation(
  p_session_id UUID
) RETURNS TABLE (
  success BOOLEAN,
  items_released INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  -- Liberar stock reservado
  UPDATE stockxbin s
  SET 
    reservado = GREATEST(0, reservado - pli.quantity),
    updated_at = now()
  FROM picking_libre_items pli
  WHERE s.id = pli.stock_id
    AND pli.session_id = p_session_id
    AND s.reservado >= pli.quantity;  -- Safety check

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- Registrar en audit log
  INSERT INTO picking_libre_audit_log (
    session_id,
    event_type,
    event_status,
    details
  ) VALUES (
    p_session_id,
    'STOCK_RESERVATION_RELEASED',
    'success',
    jsonb_build_object(
      'items_released', v_updated,
      'timestamp', now()
    )
  );

  RAISE NOTICE 'Liberadas % reservas para sesión %', v_updated, p_session_id;
  
  RETURN QUERY SELECT true, v_updated, NULL::TEXT;
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT 
      false,
      0,
      format('Error al liberar reservas: %s', SQLERRM)::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 4. FUNCIÓN DE CONSUMO ESTRICTO (CON VALIDACIÓN DE RESERVAS)
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

  -- Verificar que todo el stock esté reservado
  FOR v_item IN
    SELECT pli.*, s.disponibles, s.reservado, s.comprometido
    FROM picking_libre_items pli
    JOIN stockxbin s ON s.id = pli.stock_id
    WHERE pli.session_id = p_session_id
    FOR UPDATE OF s NOWAIT
  LOOP
    -- Validar que stock está reservado
    IF v_item.reservado < v_item.quantity THEN
      RETURN QUERY SELECT 
        false,
        0,
        format('Stock no reservado para SKU %s en bin %s. Reservado: %s, Necesario: %s', 
               v_item.sku, v_item.bin_code, v_item.reservado, v_item.quantity)::TEXT,
        v_session.data_version;
      RETURN;
    END IF;

    -- Validar disponibilidad
    IF v_item.disponibles < v_item.quantity THEN
      RETURN QUERY SELECT 
        false,
        0,
        format('Stock insuficiente para SKU %s en bin %s. Disponible: %s, Necesario: %s', 
               v_item.sku, v_item.bin_code, v_item.disponibles, v_item.quantity)::TEXT,
        v_session.data_version;
      RETURN;
    END IF;
  END LOOP;

  -- Consumir stock (restar de disponibles Y reservado)
  UPDATE stockxbin s
  SET 
    disponibles = disponibles - pli.quantity,
    reservado = reservado - pli.quantity,
    comprometido = GREATEST(0, comprometido - pli.quantity),
    updated_at = now()
  FROM picking_libre_items pli
  WHERE s.id = pli.stock_id
    AND pli.session_id = p_session_id;

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

  -- Registrar en audit log
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

  RAISE NOTICE 'Stock consumido exitosamente: % items, Nueva versión: %', v_updated, v_new_version;
  
  RETURN QUERY SELECT true, v_updated, NULL::TEXT, v_new_version;
  
EXCEPTION
  WHEN lock_not_available THEN
    RETURN QUERY SELECT 
      false,
      0,
      'Stock bloqueado por otra operación. Intente nuevamente.'::TEXT,
      v_session.data_version;
  WHEN OTHERS THEN
    RETURN QUERY SELECT 
      false,
      0,
      format('Error al consumir stock: %s', SQLERRM)::TEXT,
      COALESCE(v_session.data_version, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 5. FUNCIÓN DE VALIDACIÓN PRE-RESERVA
-- =====================================================

CREATE OR REPLACE FUNCTION validate_stock_before_reservation(
  p_session_id UUID
) RETURNS TABLE (
  is_valid BOOLEAN,
  error_message TEXT,
  invalid_items JSONB
) AS $$
DECLARE
  v_invalid_items JSONB;
BEGIN
  -- Buscar items con stock insuficiente
  SELECT jsonb_agg(
    jsonb_build_object(
      'sku', pli.sku,
      'bin', pli.bin_code,
      'quantity_needed', pli.quantity,
      'available', COALESCE(s.disponibles - s.reservado, 0),
      'deficit', pli.quantity - COALESCE(s.disponibles - s.reservado, 0)
    )
  ) INTO v_invalid_items
  FROM picking_libre_items pli
  LEFT JOIN stockxbin s ON s.id = pli.stock_id
  WHERE pli.session_id = p_session_id
    AND pli.quantity > COALESCE(s.disponibles - s.reservado, 0);

  IF v_invalid_items IS NOT NULL THEN
    RETURN QUERY SELECT 
      false, 
      'Stock insuficiente para algunos items'::TEXT,
      v_invalid_items;
    RETURN;
  END IF;

  -- Todo OK
  RETURN QUERY SELECT true, NULL::TEXT, '[]'::JSONB;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 6. COMENTARIOS Y DOCUMENTACIÓN
-- =====================================================

COMMENT ON COLUMN stockxbin.reservado IS 'Stock temporalmente reservado durante proceso de emisión. Se consume o libera al finalizar.';
COMMENT ON FUNCTION reserve_stock_for_session IS 'FASE 5: Reserva stock antes de emitir documento. Usa FOR UPDATE NOWAIT para prevenir race conditions.';
COMMENT ON FUNCTION release_stock_reservation IS 'FASE 5: Libera reservas de stock si falla la emisión del documento.';
COMMENT ON FUNCTION consume_picking_libre_stock_strict IS 'FASE 5: Consume stock validando que esté reservado. Usa optimistic locking.';
COMMENT ON FUNCTION validate_stock_before_reservation IS 'FASE 5: Valida disponibilidad de stock antes de intentar reservar.';