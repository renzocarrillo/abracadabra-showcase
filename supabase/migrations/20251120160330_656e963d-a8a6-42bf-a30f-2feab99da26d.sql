-- =====================================================
-- FASE 7 EXTENSIÓN: Eliminación Manual de Sesiones Zombie
-- =====================================================

-- 1. Crear nuevo permiso para eliminar sesiones zombie
INSERT INTO permissions (name, display_name, description, category)
VALUES (
  'delete_zombie_sessions',
  'Eliminar Sesiones Zombie',
  'Permite eliminar permanentemente sesiones zombie y liberar su stock reservado',
  'picking'
)
ON CONFLICT (name) DO NOTHING;

-- 2. RPC para eliminar sesión zombie individual
CREATE OR REPLACE FUNCTION delete_zombie_session(
  p_session_id UUID
) RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_stock_released INTEGER := 0;
  v_items_count INTEGER := 0;
  v_user_email TEXT;
BEGIN
  -- Obtener email del usuario actual
  v_user_email := COALESCE(auth.jwt()->>'email', 'system');
  
  -- 1. Verificar que la sesión existe
  SELECT * INTO v_session
  FROM picking_libre_sessions
  WHERE id = p_session_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Sesión no encontrada'
    );
  END IF;
  
  -- 2. Contar items de la sesión
  SELECT COUNT(*) INTO v_items_count
  FROM picking_libre_items
  WHERE session_id = p_session_id;
  
  -- 3. Liberar stock reservado (si existe)
  BEGIN
    SELECT items_released INTO v_stock_released
    FROM release_stock_reservation(p_session_id);
  EXCEPTION
    WHEN OTHERS THEN
      v_stock_released := 0;
  END;
  
  -- 4. Marcar la sesión como cancelada
  UPDATE picking_libre_sessions
  SET 
    status = 'cancelado',
    completed_at = NOW(),
    updated_at = NOW(),
    last_error = 'Eliminada manualmente desde Dashboard Zombie'
  WHERE id = p_session_id;
  
  -- 5. Registrar en audit log
  INSERT INTO picking_libre_audit_log (
    session_id,
    event_type,
    event_status,
    user_id,
    user_name,
    details
  ) VALUES (
    p_session_id,
    'ZOMBIE_SESSION_DELETED',
    'success',
    auth.uid(),
    v_user_email,
    jsonb_build_object(
      'previous_status', v_session.status,
      'items_count', v_items_count,
      'stock_released', v_stock_released,
      'deleted_at', NOW(),
      'deleted_by', v_user_email
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Sesión eliminada correctamente',
    'session_id', p_session_id,
    'stock_released', v_stock_released,
    'items_count', v_items_count
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log del error
    INSERT INTO picking_libre_audit_log (
      session_id,
      event_type,
      event_status,
      user_id,
      user_name,
      error_message,
      details
    ) VALUES (
      p_session_id,
      'ZOMBIE_SESSION_DELETE_FAILED',
      'error',
      auth.uid(),
      v_user_email,
      SQLERRM,
      jsonb_build_object(
        'error', SQLERRM,
        'attempted_at', NOW()
      )
    );
    
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- 3. RPC para eliminar múltiples sesiones zombie
CREATE OR REPLACE FUNCTION delete_multiple_zombie_sessions(
  p_session_ids UUID[]
) RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id UUID;
  v_result jsonb;
  v_success_count INTEGER := 0;
  v_failed_count INTEGER := 0;
  v_total_stock_released INTEGER := 0;
  v_results jsonb[] := '{}';
  v_user_email TEXT;
BEGIN
  v_user_email := COALESCE(auth.jwt()->>'email', 'system');
  
  -- Procesar cada sesión
  FOREACH v_session_id IN ARRAY p_session_ids
  LOOP
    v_result := delete_zombie_session(v_session_id);
    v_results := array_append(v_results, v_result);
    
    IF (v_result->>'success')::boolean THEN
      v_success_count := v_success_count + 1;
      v_total_stock_released := v_total_stock_released + 
        COALESCE((v_result->>'stock_released')::integer, 0);
    ELSE
      v_failed_count := v_failed_count + 1;
    END IF;
  END LOOP;
  
  -- Log del batch
  INSERT INTO picking_libre_audit_log (
    event_type,
    event_status,
    user_id,
    user_name,
    details
  ) VALUES (
    'ZOMBIE_SESSIONS_BATCH_DELETE',
    CASE WHEN v_failed_count = 0 THEN 'success' ELSE 'partial' END,
    auth.uid(),
    v_user_email,
    jsonb_build_object(
      'total_attempted', array_length(p_session_ids, 1),
      'deleted', v_success_count,
      'failed', v_failed_count,
      'total_stock_released', v_total_stock_released,
      'batch_at', NOW()
    )
  );
  
  RETURN jsonb_build_object(
    'success', v_failed_count = 0,
    'deleted', v_success_count,
    'failed', v_failed_count,
    'total_stock_released', v_total_stock_released,
    'details', v_results
  );
END;
$$;

-- 4. Otorgar permisos de ejecución
GRANT EXECUTE ON FUNCTION delete_zombie_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_multiple_zombie_sessions(UUID[]) TO authenticated;

-- 5. Comentarios para documentación
COMMENT ON FUNCTION delete_zombie_session(UUID) IS 
'Elimina una sesión zombie individual, libera su stock reservado y registra la acción en el audit log';

COMMENT ON FUNCTION delete_multiple_zombie_sessions(UUID[]) IS 
'Elimina múltiples sesiones zombie en batch, útil para limpieza masiva desde el dashboard';