
-- =====================================================
-- FASE 7: RECOVERY AUTOMÁTICO
-- Detección y recuperación de sesiones zombie
-- =====================================================

-- 1. Eliminar función existente si tiene firma diferente
-- =====================================================

DROP FUNCTION IF EXISTS detect_zombie_sessions();

-- 2. Crear función para detectar sesiones zombie
-- =====================================================

CREATE FUNCTION detect_zombie_sessions()
RETURNS TABLE(
  session_id UUID,
  status TEXT,
  created_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  retry_count INT,
  last_error TEXT,
  zombie_type TEXT,
  minutes_inactive INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.status,
    s.created_at,
    s.last_activity_at,
    s.retry_count,
    s.last_error,
    CASE 
      -- Caso 1: Sesión en verificación por más de 2 horas (abandonada)
      WHEN s.status = 'verificacion' AND s.last_activity_at < now() - INTERVAL '2 hours'
        THEN 'abandoned_verification'
      
      -- Caso 2: Sesión en proceso por más de 3 horas (abandonada)
      WHEN s.status = 'en_proceso' AND s.last_activity_at < now() - INTERVAL '3 hours'
        THEN 'abandoned_scanning'
      
      -- Caso 3: Sesión emitiendo por más de 10 minutos (stuck)
      WHEN s.status = 'emitiendo' AND s.last_activity_at < now() - INTERVAL '10 minutes'
        THEN 'stuck_emitting'
      
      -- Caso 4: Sesión con errores y retry_count > 0 por más de 30 minutos
      WHEN s.status IN ('en_proceso', 'verificacion') 
           AND s.retry_count > 0 
           AND s.last_activity_at < now() - INTERVAL '30 minutes'
        THEN 'failed_with_retries'
      
      ELSE 'unknown'
    END as zombie_type,
    EXTRACT(EPOCH FROM (now() - s.last_activity_at))::INT / 60 as minutes_inactive
  FROM picking_libre_sessions s
  WHERE 
    -- Excluir sesiones ya completadas o canceladas
    s.status NOT IN ('completado', 'cancelado')
    AND (
      -- Sesiones abandonadas en verificación (>2h)
      (s.status = 'verificacion' AND s.last_activity_at < now() - INTERVAL '2 hours')
      OR
      -- Sesiones abandonadas en escaneo (>3h)
      (s.status = 'en_proceso' AND s.last_activity_at < now() - INTERVAL '3 hours')
      OR
      -- Sesiones stuck en emisión (>10min)
      (s.status = 'emitiendo' AND s.last_activity_at < now() - INTERVAL '10 minutes')
      OR
      -- Sesiones con errores sin resolver (>30min)
      (s.status IN ('en_proceso', 'verificacion') 
       AND s.retry_count > 0 
       AND s.last_activity_at < now() - INTERVAL '30 minutes')
    )
  ORDER BY s.last_activity_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION detect_zombie_sessions() IS 
'Detects zombie sessions based on inactivity patterns and status';


-- 3. Función para recuperar una sesión zombie individual
-- =====================================================

CREATE OR REPLACE FUNCTION recover_zombie_session(
  p_session_id UUID,
  p_force_cancel BOOLEAN DEFAULT false
)
RETURNS jsonb AS $$
DECLARE
  v_session RECORD;
  v_recovery_action TEXT;
  v_items_count INT;
  v_reserved_stock_released BOOLEAN := false;
BEGIN
  -- 1. Obtener información de la sesión con lock
  SELECT * INTO v_session
  FROM picking_libre_sessions
  WHERE id = p_session_id
  FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Session not found or locked by another process',
      'session_id', p_session_id
    );
  END IF;

  -- 2. Verificar si la sesión ya está completada o cancelada
  IF v_session.status IN ('completado', 'cancelado') THEN
    RETURN jsonb_build_object(
      'success', true,
      'action', 'no_action_needed',
      'message', 'Session already in final state',
      'session_id', p_session_id,
      'status', v_session.status
    );
  END IF;

  -- 3. Contar items en la sesión
  SELECT COUNT(*) INTO v_items_count
  FROM picking_libre_items
  WHERE session_id = p_session_id;

  -- 4. Determinar acción de recuperación
  IF p_force_cancel OR v_items_count = 0 OR v_session.status = 'en_proceso' THEN
    -- Acción: Cancelar sesión sin items o explícitamente forzada
    v_recovery_action := 'cancel_session';
    
    -- Liberar stock reservado si existe
    BEGIN
      PERFORM release_stock_reservation(p_session_id);
      v_reserved_stock_released := true;
    EXCEPTION
      WHEN OTHERS THEN
        -- Si falla, continuar (puede que no haya stock reservado)
        v_reserved_stock_released := false;
    END;
    
    -- Marcar como cancelada
    UPDATE picking_libre_sessions
    SET 
      status = 'cancelado',
      last_error = COALESCE(last_error, '') || ' | Auto-canceled by recovery system',
      updated_at = now(),
      completed_at = now()
    WHERE id = p_session_id;
    
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
      'session_auto_canceled',
      'success',
      v_session.created_by,
      'Recovery System',
      jsonb_build_object(
        'reason', 'zombie_session_recovery',
        'original_status', v_session.status,
        'items_count', v_items_count,
        'reserved_stock_released', v_reserved_stock_released
      )
    );
    
    RETURN jsonb_build_object(
      'success', true,
      'action', 'canceled',
      'message', 'Zombie session canceled and stock released',
      'session_id', p_session_id,
      'items_count', v_items_count,
      'reserved_stock_released', v_reserved_stock_released
    );
    
  ELSIF v_session.status = 'verificacion' THEN
    -- Acción: Retroceder a estado en_proceso para permitir re-verificación
    v_recovery_action := 'reset_to_scanning';
    
    UPDATE picking_libre_sessions
    SET 
      status = 'en_proceso',
      last_error = COALESCE(last_error, '') || ' | Reset by recovery system',
      retry_count = LEAST(retry_count + 1, 3),
      updated_at = now(),
      last_activity_at = now()
    WHERE id = p_session_id;
    
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
      'session_reset_to_scanning',
      'success',
      v_session.created_by,
      'Recovery System',
      jsonb_build_object(
        'reason', 'abandoned_verification',
        'original_status', v_session.status,
        'new_retry_count', LEAST(v_session.retry_count + 1, 3)
      )
    );
    
    RETURN jsonb_build_object(
      'success', true,
      'action', 'reset_to_scanning',
      'message', 'Session reset to scanning mode for user intervention',
      'session_id', p_session_id,
      'items_count', v_items_count
    );
    
  ELSIF v_session.status = 'emitiendo' THEN
    -- Acción: Marcar como error para investigación manual
    v_recovery_action := 'mark_as_failed';
    
    -- Liberar stock reservado
    BEGIN
      PERFORM release_stock_reservation(p_session_id);
      v_reserved_stock_released := true;
    EXCEPTION
      WHEN OTHERS THEN
        v_reserved_stock_released := false;
    END;
    
    UPDATE picking_libre_sessions
    SET 
      status = 'cancelado',
      last_error = 'Stuck in emitting state - requires manual investigation',
      retry_count = 999, -- Marcar para no reintentar automáticamente
      updated_at = now(),
      completed_at = now()
    WHERE id = p_session_id;
    
    -- Log de auditoría con alta prioridad
    INSERT INTO picking_libre_audit_log (
      session_id,
      event_type,
      event_status,
      user_id,
      user_name,
      details,
      error_message
    ) VALUES (
      p_session_id,
      'session_stuck_in_emission',
      'error',
      v_session.created_by,
      'Recovery System',
      jsonb_build_object(
        'reason', 'stuck_emitting',
        'requires_manual_review', true,
        'last_activity', v_session.last_activity_at,
        'minutes_stuck', EXTRACT(EPOCH FROM (now() - v_session.last_activity_at))::INT / 60
      ),
      'Session stuck in emitting state - possible Bsale emission issue'
    );
    
    RETURN jsonb_build_object(
      'success', true,
      'action', 'marked_for_manual_review',
      'message', 'Session marked for manual investigation - possible Bsale emission issue',
      'session_id', p_session_id,
      'requires_attention', true,
      'reserved_stock_released', v_reserved_stock_released
    );
  END IF;

  -- Caso por defecto: no se pudo determinar acción
  RETURN jsonb_build_object(
    'success', false,
    'error', 'Could not determine recovery action',
    'session_id', p_session_id,
    'status', v_session.status
  );

EXCEPTION
  WHEN lock_not_available THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Session locked by another process',
      'session_id', p_session_id,
      'retry_suggested', true
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'session_id', p_session_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION recover_zombie_session(UUID, BOOLEAN) IS 
'Recovers a single zombie session by canceling, resetting, or marking for manual review';


-- 4. Función para limpieza masiva de sesiones inactivas
-- =====================================================

CREATE OR REPLACE FUNCTION cleanup_inactive_picking_sessions(
  p_minutes INT DEFAULT 120
)
RETURNS jsonb AS $$
DECLARE
  v_session_record RECORD;
  v_sessions_canceled INT := 0;
  v_sessions_failed INT := 0;
  v_total_stock_released INT := 0;
BEGIN
  -- Procesar sesiones abandonadas que deben ser canceladas automáticamente
  FOR v_session_record IN 
    SELECT id, status, created_by, created_by_name, last_activity_at
    FROM picking_libre_sessions
    WHERE status IN ('en_proceso', 'verificacion')
      AND last_activity_at < now() - (p_minutes || ' minutes')::INTERVAL
      AND retry_count < 3 -- No cancelar sesiones ya marcadas para investigación
  LOOP
    BEGIN
      -- Intentar recuperar la sesión
      DECLARE
        v_result jsonb;
      BEGIN
        SELECT recover_zombie_session(v_session_record.id, true) INTO v_result;
        
        IF (v_result->>'success')::boolean THEN
          v_sessions_canceled := v_sessions_canceled + 1;
          
          -- Contar stock liberado si aplica
          IF (v_result->>'reserved_stock_released')::boolean THEN
            v_total_stock_released := v_total_stock_released + 1;
          END IF;
        ELSE
          v_sessions_failed := v_sessions_failed + 1;
        END IF;
      END;
    EXCEPTION
      WHEN OTHERS THEN
        v_sessions_failed := v_sessions_failed + 1;
        RAISE NOTICE 'Failed to cleanup session %: %', v_session_record.id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'sessions_canceled', v_sessions_canceled,
    'sessions_failed', v_sessions_failed,
    'total_stock_released', v_total_stock_released,
    'cleanup_threshold_minutes', p_minutes,
    'cleanup_timestamp', now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cleanup_inactive_picking_sessions(INT) IS 
'Cleans up inactive picking sessions older than specified minutes. Default: 120 minutes';


-- 5. Función para obtener estadísticas de sesiones zombie
-- =====================================================

CREATE OR REPLACE FUNCTION get_zombie_sessions_stats()
RETURNS jsonb AS $$
DECLARE
  v_stats jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_zombies', COUNT(*),
    'by_type', jsonb_object_agg(
      zombie_type,
      type_count
    ),
    'oldest_zombie_minutes', MAX(minutes_inactive),
    'average_inactive_minutes', ROUND(AVG(minutes_inactive)::numeric, 2),
    'generated_at', now()
  ) INTO v_stats
  FROM (
    SELECT 
      zombie_type,
      COUNT(*) as type_count,
      minutes_inactive
    FROM detect_zombie_sessions()
    GROUP BY zombie_type, minutes_inactive
  ) subquery;

  RETURN COALESCE(v_stats, jsonb_build_object(
    'total_zombies', 0,
    'message', 'No zombie sessions detected',
    'generated_at', now()
  ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_zombie_sessions_stats() IS 
'Returns statistics about current zombie sessions';
