-- =====================================================
-- LIMPIEZA: Eliminar funciones obsoletas de Fase 1
-- =====================================================

-- Eliminar funciones obsoletas que nunca se usan
DROP FUNCTION IF EXISTS public.reserve_stock_optimistic(uuid, jsonb, uuid, text);
DROP FUNCTION IF EXISTS public.consume_picking_libre_stock(uuid, integer);
DROP FUNCTION IF EXISTS public.consume_picking_libre_stock(uuid);

-- Eliminar también la función de consumo estricto vieja si existe
DROP FUNCTION IF EXISTS public.consume_picking_libre_stock_strict(uuid, integer);

-- =====================================================
-- RECREAR: consume_picking_libre_stock_strict 
-- (Version final y limpia)
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
  v_total_quantity INTEGER;
BEGIN
  RAISE LOG '[CONSUME_STRICT] ============================================';
  RAISE LOG '[CONSUME_STRICT] INICIO - Session: %', p_session_id;

  -- 1. Obtener sesión con lock
  SELECT * INTO v_session
  FROM picking_libre_sessions
  WHERE id = p_session_id
  FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    RAISE LOG '[CONSUME_STRICT] ERROR: Sesión no encontrada';
    RETURN QUERY SELECT false, 0, 'Sesión no encontrada'::TEXT, 0;
    RETURN;
  END IF;

  RAISE LOG '[CONSUME_STRICT] Sesión encontrada - Status: %, Version: %', v_session.status, v_session.data_version;

  -- 2. Validar versión (optimistic locking)
  IF p_expected_version IS NOT NULL AND v_session.data_version != p_expected_version THEN
    RAISE LOG '[CONSUME_STRICT] ERROR: Version mismatch - Esperada: %, Actual: %', p_expected_version, v_session.data_version;
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

  RAISE LOG '[CONSUME_STRICT] Locks adquiridos exitosamente';

  -- 4. Validar que todo el stock esté reservado
  -- Consolidar por stock_id primero
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

      RAISE LOG '[CONSUME_STRICT] Validando stock_id: % - SKU: %, Bin: %, Reservado: %, Necesario: %',
        v_stock_id, v_sku, v_bin, v_reservado, v_total_quantity;

      IF v_reservado < v_total_quantity THEN
        RAISE LOG '[CONSUME_STRICT] ERROR: Stock no reservado suficiente';
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

  RAISE LOG '[CONSUME_STRICT] Validación OK - Consumiendo stock...';

  -- 5. Consumir stock (reservado → comprometido, reducir en_existencia)
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

  RAISE LOG '[CONSUME_STRICT] Stock consumido - Rows actualizados: %', v_updated;

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

  RAISE LOG '[CONSUME_STRICT] ============================================';
  RAISE LOG '[CONSUME_STRICT] COMPLETADO - Items: %, Nueva version: %', v_updated, v_new_version;

  RETURN QUERY SELECT true, v_updated, NULL::TEXT, v_new_version;
  
EXCEPTION
  WHEN lock_not_available THEN
    RAISE LOG '[CONSUME_STRICT] ERROR: Stock bloqueado';
    RETURN QUERY SELECT 
      false,
      0,
      'Stock bloqueado por otra operación. Intente nuevamente.'::TEXT,
      v_session.data_version;
  WHEN OTHERS THEN
    RAISE LOG '[CONSUME_STRICT] EXCEPTION: % - %', SQLERRM, SQLSTATE;
    RETURN QUERY SELECT 
      false,
      0,
      format('Error al consumir stock: %s', SQLERRM)::TEXT,
      COALESCE(v_session.data_version, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION consume_picking_libre_stock_strict IS 
'FASE 5 FINAL: Consume stock desde RESERVADO moviéndolo a COMPROMETIDO y reduciendo EN_EXISTENCIA.
Requiere que el stock haya sido previamente reservado con reserve_stock_for_session().
Usa optimistic locking con data_version para prevenir race conditions.';

-- =====================================================
-- ÍNDICES para optimizar las operaciones
-- =====================================================

-- Índice para consultas de stock reservado
CREATE INDEX IF NOT EXISTS idx_stockxbin_reservado 
  ON stockxbin(reservado) WHERE reservado > 0;

-- Índice compuesto para búsquedas de stock disponible
CREATE INDEX IF NOT EXISTS idx_stockxbin_disponible_sku_bin 
  ON stockxbin(sku, bin, disponibles) WHERE disponibles > 0;

DO $$ BEGIN RAISE NOTICE '✅ LIMPIEZA Y OPTIMIZACIÓN COMPLETA'; END $$;