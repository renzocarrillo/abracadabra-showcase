-- ============================================================================
-- FASE 3: BLOQUEO OPTIMISTA Y PREVENCIÓN DE RACE CONDITIONS
-- ============================================================================
-- Implementa optimistic locking con FOR UPDATE NOWAIT para prevenir
-- modificaciones concurrentes de sesiones de picking libre

-- 1. FUNCIÓN: update_session_with_lock
-- ============================================================================
-- Actualiza una sesión verificando primero su versión (optimistic locking)
-- y adquiriendo un lock exclusivo (FOR UPDATE NOWAIT)
CREATE OR REPLACE FUNCTION public.update_session_with_lock(
  p_session_id uuid,
  p_expected_version integer,
  p_new_data jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  success boolean,
  new_version integer,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_version integer;
  v_locked boolean := false;
BEGIN
  -- Configurar timeout para el lock
  SET LOCAL lock_timeout = '5s';
  
  -- Intentar adquirir lock exclusivo en la fila
  BEGIN
    SELECT data_version INTO v_current_version
    FROM picking_libre_sessions
    WHERE id = p_session_id
    FOR UPDATE NOWAIT;
    
    v_locked := true;
    
  EXCEPTION
    WHEN lock_not_available THEN
      RETURN QUERY SELECT 
        false,
        0,
        'Sesión bloqueada por otra operación. Intente nuevamente.'::text;
      RETURN;
  END;

  -- Verificar versión (optimistic locking)
  IF v_current_version != p_expected_version THEN
    RETURN QUERY SELECT 
      false, 
      v_current_version,
      format('Conflicto de versión: esperado %s, actual %s. La sesión fue modificada por otro usuario.', 
             p_expected_version, v_current_version)::text;
    RETURN;
  END IF;

  -- Actualizar con nueva versión
  UPDATE picking_libre_sessions
  SET 
    data_version = v_current_version + 1,
    last_activity_at = now(),
    updated_at = now()
  WHERE id = p_session_id;

  -- Log del lock exitoso
  INSERT INTO picking_libre_audit_log (
    session_id, event_type, event_status, details
  ) VALUES (
    p_session_id, 
    'SESSION_LOCKED', 
    'success',
    jsonb_build_object(
      'version', v_current_version,
      'new_version', v_current_version + 1
    )
  );

  RETURN QUERY SELECT 
    true, 
    v_current_version + 1, 
    NULL::text;
    
EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT 
      false,
      0,
      format('Error al actualizar sesión: %s', SQLERRM)::text;
END;
$$;

-- 2. FUNCIÓN: finalize_picking_session_atomic
-- ============================================================================
-- Finaliza una sesión de forma atómica con validaciones exhaustivas:
-- - Verifica versión y adquiere lock
-- - Valida estado de la sesión
-- - Verifica disponibilidad de stock
-- - Cambia estado a 'emitiendo' para prevenir doble emisión
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
BEGIN
  -- 1. Verificar lock y versión
  SELECT * INTO v_lock_result
  FROM update_session_with_lock(p_session_id, p_expected_version, '{}'::jsonb);

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

  -- Validar que esté en estado correcto
  IF v_current_status NOT IN ('en_proceso', 'verificado') THEN
    RETURN QUERY SELECT 
      false,
      v_current_status,
      v_new_version,
      format('Sesión en estado inválido para finalizar: %s', v_current_status)::text,
      NULL::jsonb;
    RETURN;
  END IF;

  -- 3. Validar stock disponible para todos los items
  WITH stock_validation AS (
    SELECT 
      pli.sku,
      pli.bin_code,
      pli.quantity as requested,
      COALESCE(s.disponibles, 0) as available,
      (pli.quantity > COALESCE(s.disponibles, 0)) as insufficient,
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
      'available', available,
      'issue', CASE
        WHEN bin_frozen THEN 'Bin congelado'
        WHEN product_frozen THEN 'Producto congelado'
        WHEN insufficient THEN 'Stock insuficiente'
        ELSE 'Otro'
      END
    )
  )
  INTO v_stock_issues
  FROM stock_validation
  WHERE insufficient OR bin_frozen OR product_frozen;

  -- Si hay problemas de stock, abortar
  IF v_stock_issues IS NOT NULL AND jsonb_array_length(v_stock_issues) > 0 THEN
    RETURN QUERY SELECT 
      false, 
      'en_proceso'::text,
      v_new_version,
      'No se puede finalizar: hay productos con problemas de stock'::text,
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
      'version', v_new_version
    )
  );

  RETURN QUERY SELECT 
    true, 
    'emitiendo'::text,
    v_new_version,
    NULL::text,
    NULL::jsonb;
    
EXCEPTION
  WHEN OTHERS THEN
    -- Log del error
    INSERT INTO picking_libre_audit_log (
      session_id, 
      event_type, 
      event_status,
      error_message,
      stack_trace
    ) VALUES (
      p_session_id,
      'FINALIZATION_FAILED',
      'error',
      SQLERRM,
      SQLSTATE
    );
    
    RETURN QUERY SELECT 
      false,
      v_current_status,
      v_new_version,
      format('Error al finalizar sesión: %s', SQLERRM)::text,
      NULL::jsonb;
END;
$$;

-- 3. ÍNDICES para optimizar locks
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_sessions_status_version 
ON picking_libre_sessions(status, data_version) 
WHERE status IN ('en_proceso', 'verificado', 'emitiendo');

CREATE INDEX IF NOT EXISTS idx_sessions_active_lock
ON picking_libre_sessions(id, data_version, status)
WHERE status IN ('en_proceso', 'verificado');

-- 4. COMENTARIOS
-- ============================================================================
COMMENT ON FUNCTION public.update_session_with_lock IS 
'Actualiza sesión con optimistic locking. Verifica versión y adquiere lock exclusivo (FOR UPDATE NOWAIT).';

COMMENT ON FUNCTION public.finalize_picking_session_atomic IS 
'Finaliza sesión de forma atómica con validaciones de versión, estado y stock. Previene race conditions.';

-- 5. ACTUALIZAR ENUM de estados (agregar 'emitiendo')
-- ============================================================================
DO $$ 
BEGIN
  -- Verificar si el tipo existe y no tiene ya el valor 'emitiendo'
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = 'public.picking_session_status'::regtype 
    AND enumlabel = 'emitiendo'
  ) THEN
    -- Agregar nuevo valor al enum
    ALTER TYPE public.picking_session_status ADD VALUE IF NOT EXISTS 'emitiendo';
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    -- Si el tipo no existe, crearlo
    CREATE TYPE public.picking_session_status AS ENUM (
      'en_proceso', 
      'verificado', 
      'emitiendo', 
      'completado', 
      'cancelado', 
      'error'
    );
END $$;

DO $$ BEGIN RAISE NOTICE '✅ FASE 3: Bloqueo optimista implementado'; END $$;