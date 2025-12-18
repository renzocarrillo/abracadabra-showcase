
-- =====================================================
-- FIX DEFINITIVO: SISTEMA DE 2 ESTADOS PARA PICKING LIBRE
-- =====================================================
-- ESTADOS: disponibles, reservado
-- FÓRMULA: en_existencia = disponibles + reservado
-- NO USAR: comprometido (solo para ventas normales)
-- =====================================================

-- 1. RECREAR consume_picking_libre_stock_strict (SIN comprometido)
DROP FUNCTION IF EXISTS consume_picking_libre_stock_strict(uuid, integer);

CREATE OR REPLACE FUNCTION consume_picking_libre_stock_strict(
  p_session_id uuid,
  p_expected_version integer DEFAULT NULL
)
RETURNS TABLE(
  success boolean,
  items_updated integer,
  error_message text,
  new_version integer
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated INTEGER := 0;
  v_session RECORD;
  v_new_version INTEGER;
  v_stock_id UUID;
  v_total_quantity INTEGER;
BEGIN
  RAISE LOG '[CONSUME_2_STATES] ============================================';
  RAISE LOG '[CONSUME_2_STATES] INICIO - Session: %', p_session_id;

  -- 1. Obtener sesión con lock
  SELECT * INTO v_session
  FROM picking_libre_sessions
  WHERE id = p_session_id
  FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    RAISE LOG '[CONSUME_2_STATES] ERROR: Sesión no encontrada';
    RETURN QUERY SELECT false, 0, 'Sesión no encontrada'::TEXT, 0;
    RETURN;
  END IF;

  RAISE LOG '[CONSUME_2_STATES] Sesión encontrada - Status: %, Version: %', 
    v_session.status, v_session.data_version;

  -- 2. Validar versión (optimistic locking)
  IF p_expected_version IS NOT NULL AND v_session.data_version != p_expected_version THEN
    RAISE LOG '[CONSUME_2_STATES] ERROR: Version mismatch - Esperada: %, Actual: %', 
      p_expected_version, v_session.data_version;
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

  RAISE LOG '[CONSUME_2_STATES] Locks adquiridos exitosamente';

  -- 4. Validar que todo el stock esté reservado
  FOR v_stock_id, v_total_quantity IN
    SELECT 
      stock_id,
      SUM(quantity) as total_qty
    FROM picking_libre_items
    WHERE session_id = p_session_id
    GROUP BY stock_id
  LOOP
    DECLARE
      v_reservado INTEGER;
      v_sku TEXT;
      v_bin TEXT;
    BEGIN
      SELECT reservado, sku, bin 
      INTO v_reservado, v_sku, v_bin
      FROM stockxbin
      WHERE id = v_stock_id;

      RAISE LOG '[CONSUME_2_STATES] Validando stock_id: % - SKU: %, Bin: %, Reservado: %, Necesario: %',
        v_stock_id, v_sku, v_bin, v_reservado, v_total_quantity;

      IF v_reservado < v_total_quantity THEN
        RAISE LOG '[CONSUME_2_STATES] ERROR: Stock no reservado suficiente';
        RETURN QUERY SELECT 
          false,
          0,
          format('Stock no reservado para SKU %s en bin %s. Reservado: %s, Necesario: %s', 
                 v_sku, v_bin, v_reservado, v_total_quantity)::TEXT,
          v_session.data_version;
        RETURN;
      END IF;
    END;
  END LOOP;

  RAISE LOG '[CONSUME_2_STATES] Validación OK - Consumiendo stock...';

  -- 5. CONSUMIR STOCK: reservado → 0 (SIN tocar comprometido)
  -- El trigger calculate_en_existencia recalculará automáticamente en_existencia
  UPDATE stockxbin s
  SET 
    reservado = reservado - consolidated.total_quantity,
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

  RAISE LOG '[CONSUME_2_STATES] Stock consumido - Rows actualizados: %', v_updated;

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
    'STOCK_CONSUMED_2_STATES',
    'success',
    jsonb_build_object(
      'items_updated', v_updated,
      'version', v_new_version,
      'method', '2_states_only',
      'timestamp', now()
    )
  );

  RAISE LOG '[CONSUME_2_STATES] ============================================';
  RAISE LOG '[CONSUME_2_STATES] COMPLETADO - Items: %, Nueva version: %', v_updated, v_new_version;

  RETURN QUERY SELECT true, v_updated, NULL::TEXT, v_new_version;
  
EXCEPTION
  WHEN lock_not_available THEN
    RAISE LOG '[CONSUME_2_STATES] ERROR: Stock bloqueado';
    RETURN QUERY SELECT 
      false,
      0,
      'Stock bloqueado por otra operación. Intente nuevamente.'::TEXT,
      v_session.data_version;
  WHEN OTHERS THEN
    RAISE LOG '[CONSUME_2_STATES] EXCEPTION: % - %', SQLERRM, SQLSTATE;
    RETURN QUERY SELECT 
      false,
      0,
      format('Error al consumir stock: %s', SQLERRM)::TEXT,
      COALESCE(v_session.data_version, 0);
END;
$$;

COMMENT ON FUNCTION consume_picking_libre_stock_strict IS 
'FASE 5 - SISTEMA 2 ESTADOS: Consume stock de Picking Libre moviendo reservado → 0.
NO usa comprometido. El trigger calculate_en_existencia recalcula en_existencia automáticamente.';

-- 2. VERIFICAR Y RECREAR release_stock_reservation (sin tocar comprometido)
DROP FUNCTION IF EXISTS release_stock_reservation(uuid);

CREATE OR REPLACE FUNCTION release_stock_reservation(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_items_released INTEGER := 0;
BEGIN
  RAISE LOG '[RELEASE_2_STATES] Liberando reservas - Session: %', p_session_id;

  -- Liberar reservas: reservado → disponibles
  UPDATE stockxbin s
  SET 
    reservado = reservado - consolidated.total_quantity,
    disponibles = disponibles + consolidated.total_quantity,
    updated_at = now()
  FROM (
    SELECT 
      stock_id,
      SUM(quantity) as total_quantity
    FROM picking_libre_items
    WHERE session_id = p_session_id
    GROUP BY stock_id
  ) consolidated
  WHERE s.id = consolidated.stock_id
    AND s.reservado >= consolidated.total_quantity;

  GET DIAGNOSTICS v_items_released = ROW_COUNT;

  RAISE LOG '[RELEASE_2_STATES] Items liberados: %', v_items_released;

  -- Log de auditoría
  INSERT INTO picking_libre_audit_log (
    session_id,
    event_type,
    event_status,
    details
  ) VALUES (
    p_session_id,
    'STOCK_RELEASED_2_STATES',
    'success',
    jsonb_build_object(
      'items_released', v_items_released,
      'method', '2_states_only',
      'timestamp', now()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'items_released', v_items_released
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG '[RELEASE_2_STATES] ERROR: %', SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error_message', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION release_stock_reservation IS 
'FASE 5 - SISTEMA 2 ESTADOS: Libera reservas de Picking Libre moviendo reservado → disponibles.
NO usa comprometido.';

-- 3. LIMPIAR stock comprometido atorado de Picking Libre (corrección retroactiva)
DO $$ 
DECLARE
  v_cleaned INTEGER := 0;
BEGIN
  -- Identificar stock con comprometido que debería estar en 0
  -- (stock que tiene reservado = 0 y comprometido > 0 en bins de Picking Libre)
  UPDATE stockxbin
  SET 
    comprometido = 0,
    updated_at = now()
  WHERE comprometido > 0
    AND reservado = 0
    AND bin IN ('Transito', 'TRANSITO', 'transito')
    AND NOT EXISTS (
      -- Verificar que no haya ventas normales usando este stock
      SELECT 1 FROM ventas_asignaciones va
      WHERE va.stock_id = stockxbin.id
    );

  GET DIAGNOSTICS v_cleaned = ROW_COUNT;

  RAISE NOTICE '========================================';
  RAISE NOTICE '🧹 LIMPIEZA COMPLETADA';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Registros limpiados: %', v_cleaned;
  RAISE NOTICE 'Stock comprometido atorado → 0';
  RAISE NOTICE 'El trigger recalculará en_existencia correctamente';
  RAISE NOTICE '========================================';
END $$;

-- 4. Log final
DO $$ 
BEGIN 
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ FIX 2 ESTADOS COMPLETADO';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'SISTEMA SIMPLIFICADO:';
  RAISE NOTICE '  • disponibles: Stock físico disponible';
  RAISE NOTICE '  • reservado: Stock reservado temporalmente';
  RAISE NOTICE '  • en_existencia = disponibles + reservado';
  RAISE NOTICE '';
  RAISE NOTICE 'FLUJO PICKING LIBRE:';
  RAISE NOTICE '  1. Escanear: disponibles → reservado';
  RAISE NOTICE '  2. Emitir: reservado → 0';
  RAISE NOTICE '  3. Trigger recalcula: en_existencia';
  RAISE NOTICE '';
  RAISE NOTICE 'COMPROMETIDO: Solo para ventas normales';
  RAISE NOTICE '========================================';
END $$;
