-- ============================================================================
-- FASE 1: GESTIÓN DE STOCK CON BLOQUEO OPTIMISTA (CORREGIDO)
-- ============================================================================

-- Eliminar versión anterior de consume_picking_libre_stock si existe
DROP FUNCTION IF EXISTS public.consume_picking_libre_stock(uuid);
DROP FUNCTION IF EXISTS public.consume_picking_libre_stock(uuid, integer);

-- 1. FUNCIÓN: reserve_stock_optimistic
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reserve_stock_optimistic(
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
  item_record jsonb;
  stock_record RECORD;
  bin_record RECORD;
  session_record RECORD;
  total_items_reserved integer := 0;
  skus_processed text[] := '{}';
  insufficient_stock_errors text[] := '{}';
  frozen_errors text[] := '{}';
  start_time timestamptz;
  execution_time_ms integer;
BEGIN
  start_time := clock_timestamp();
  
  RAISE NOTICE '🔵 [RESERVE_STOCK] Iniciando reserva para sesión %', p_session_id;
  
  SELECT * INTO session_record
  FROM picking_libre_sessions
  WHERE id = p_session_id
  FOR UPDATE NOWAIT;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'SESSION_NOT_FOUND',
      'message', 'Sesión no encontrada'
    );
  END IF;
  
  IF session_record.status NOT IN ('en_proceso', 'verificacion_pendiente') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_SESSION_STATUS',
      'message', format('Sesión en estado inválido: %s', session_record.status)
    );
  END IF;
  
  FOR item_record IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    DECLARE
      v_sku text := item_record->>'sku';
      v_bin_code text := item_record->>'bin_code';
      v_quantity integer := (item_record->>'quantity')::integer;
      v_stock_id uuid := (item_record->>'stock_id')::uuid;
    BEGIN
      SELECT * INTO bin_record FROM bins WHERE bin_code = v_bin_code;
      
      IF FOUND AND bin_record.is_frozen = true THEN
        frozen_errors := array_append(frozen_errors, format('Bin %s está congelado', v_bin_code));
        RAISE NOTICE '  ❌ Bin % está congelado', v_bin_code;
        CONTINUE;
      END IF;
      
      IF EXISTS (SELECT 1 FROM productos_congelados WHERE sku = v_sku) THEN
        frozen_errors := array_append(frozen_errors, format('Producto %s está congelado', v_sku));
        RAISE NOTICE '  ❌ Producto % está congelado', v_sku;
        CONTINUE;
      END IF;
      
      SELECT * INTO stock_record
      FROM stockxbin
      WHERE id = v_stock_id AND sku = v_sku AND bin = v_bin_code
      FOR UPDATE NOWAIT;
      
      IF NOT FOUND THEN
        insufficient_stock_errors := array_append(insufficient_stock_errors,
          format('Stock no encontrado para SKU %s en bin %s', v_sku, v_bin_code));
        RAISE NOTICE '  ❌ Stock no encontrado: % en %', v_sku, v_bin_code;
        CONTINUE;
      END IF;
      
      IF stock_record.disponibles < v_quantity THEN
        insufficient_stock_errors := array_append(insufficient_stock_errors,
          format('Stock insuficiente para SKU %s en bin %s: disponible %s, necesario %s',
                 v_sku, v_bin_code, stock_record.disponibles, v_quantity));
        RAISE NOTICE '  ❌ Stock insuficiente: % en %', v_sku, v_bin_code;
        CONTINUE;
      END IF;
      
      UPDATE stockxbin
      SET disponibles = disponibles - v_quantity,
          comprometido = comprometido + v_quantity,
          updated_at = now()
      WHERE id = v_stock_id;
      
      total_items_reserved := total_items_reserved + v_quantity;
      skus_processed := array_append(skus_processed, v_sku);
      
      RAISE NOTICE '  ✓ Reservado: % unidades de % en %', v_quantity, v_sku, v_bin_code;
      
    EXCEPTION
      WHEN lock_not_available THEN
        insufficient_stock_errors := array_append(insufficient_stock_errors,
          format('Stock bloqueado para SKU %s en bin %s', v_sku, v_bin_code));
        RAISE NOTICE '  ⚠️  Stock bloqueado: % en %', v_sku, v_bin_code;
        CONTINUE;
    END;
  END LOOP;
  
  execution_time_ms := EXTRACT(EPOCH FROM (clock_timestamp() - start_time)) * 1000;
  
  IF array_length(frozen_errors, 1) > 0 OR array_length(insufficient_stock_errors, 1) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'PARTIAL_RESERVATION',
      'message', 'No se pudo reservar todo el stock solicitado',
      'total_reserved', total_items_reserved,
      'frozen_errors', frozen_errors,
      'insufficient_stock_errors', insufficient_stock_errors
    );
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', format('Stock reservado exitosamente: %s unidades', total_items_reserved),
    'total_reserved', total_items_reserved,
    'execution_time_ms', execution_time_ms
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'RESERVATION_FAILED',
      'message', SQLERRM
    );
END;
$$;


-- 2. FUNCIÓN: consume_picking_libre_stock (versión nueva con version control)
-- ============================================================================
CREATE FUNCTION public.consume_picking_libre_stock(
  p_session_id uuid,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_record RECORD;
  item_record RECORD;
  stock_record RECORD;
  total_consumed integer := 0;
  errors text[] := '{}';
  start_time timestamptz;
  execution_time_ms integer;
  current_retry_count integer;
BEGIN
  start_time := clock_timestamp();
  
  RAISE NOTICE '🔵 [CONSUME_STOCK] Iniciando consumo para sesión %', p_session_id;
  
  SELECT * INTO session_record FROM picking_libre_sessions WHERE id = p_session_id FOR UPDATE NOWAIT;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND');
  END IF;
  
  IF p_expected_version IS NOT NULL AND session_record.data_version != p_expected_version THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'VERSION_MISMATCH',
      'expected_version', p_expected_version,
      'current_version', session_record.data_version
    );
  END IF;
  
  IF session_record.bsale_response IS NULL OR session_record.url_public_view IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'BSALE_NOT_EMITTED');
  END IF;
  
  current_retry_count := COALESCE(session_record.retry_count, 0);
  
  FOR item_record IN SELECT * FROM picking_libre_items WHERE session_id = p_session_id ORDER BY bin_code, sku
  LOOP
    BEGIN
      SELECT * INTO stock_record FROM stockxbin WHERE id = item_record.stock_id FOR UPDATE NOWAIT;
      
      IF NOT FOUND THEN
        errors := array_append(errors, format('Stock no encontrado: %s', item_record.sku));
        CONTINUE;
      END IF;
      
      IF stock_record.comprometido < item_record.quantity THEN
        errors := array_append(errors, format('Stock comprometido insuficiente: %s', item_record.sku));
        CONTINUE;
      END IF;
      
      UPDATE stockxbin
      SET comprometido = comprometido - item_record.quantity,
          en_existencia = en_existencia - item_record.quantity,
          updated_at = now()
      WHERE id = item_record.stock_id;
      
      total_consumed := total_consumed + item_record.quantity;
      
    EXCEPTION
      WHEN lock_not_available THEN
        errors := array_append(errors, format('Stock bloqueado: %s', item_record.sku));
        CONTINUE;
    END;
  END LOOP;
  
  execution_time_ms := EXTRACT(EPOCH FROM (clock_timestamp() - start_time)) * 1000;
  
  IF array_length(errors, 1) > 0 THEN
    UPDATE picking_libre_sessions
    SET retry_count = retry_count + 1,
        last_error = array_to_string(errors, '; '),
        updated_at = now()
    WHERE id = p_session_id;
    
    RETURN jsonb_build_object(
      'success', false,
      'error', 'PARTIAL_CONSUMPTION',
      'errors', errors,
      'retry_count', current_retry_count + 1
    );
  END IF;
  
  UPDATE picking_libre_sessions
  SET status = 'completado',
      completed_at = now(),
      data_version = data_version + 1,
      retry_count = 0,
      last_error = NULL,
      updated_at = now()
  WHERE id = p_session_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'total_consumed', total_consumed,
    'new_version', session_record.data_version + 1,
    'execution_time_ms', execution_time_ms
  );
  
EXCEPTION
  WHEN lock_not_available THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_LOCKED');
  WHEN OTHERS THEN
    UPDATE picking_libre_sessions
    SET retry_count = retry_count + 1, last_error = SQLERRM, updated_at = now()
    WHERE id = p_session_id;
    
    RETURN jsonb_build_object('success', false, 'error', 'CONSUMPTION_FAILED', 'message', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.reserve_stock_optimistic IS 
'Reserva stock con bloqueo pesimista. Valida disponibilidad, bins/productos congelados.';

COMMENT ON FUNCTION public.consume_picking_libre_stock IS 
'Consume stock después de emisión Bsale. Usa bloqueo optimista con data_version.';

DO $$ BEGIN RAISE NOTICE '✅ FASE 1: RPCs de gestión de stock implementados'; END $$;