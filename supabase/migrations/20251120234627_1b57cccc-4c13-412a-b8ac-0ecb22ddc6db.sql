
-- =====================================================
-- CLEANUP: Limpiar sesiones zombie por error de constraint
-- =====================================================

-- Marcar como fallidas las sesiones que quedaron en 'emitiendo' 
-- pero nunca se completaron debido al error del constraint
UPDATE picking_libre_sessions
SET 
  status = 'error',
  last_error = 'Error de constraint - stock reservado no pudo ser actualizado. Sistema corregido.',
  updated_at = NOW()
WHERE status = 'emitiendo'
  AND completed_at IS NULL
  AND last_activity_at < NOW() - INTERVAL '5 minutes';

-- Log de limpieza
INSERT INTO picking_libre_audit_log (
  session_id,
  event_type,
  event_status,
  details,
  error_message
)
SELECT 
  id,
  'ZOMBIE_SESSION_CLEANUP',
  'failed',
  jsonb_build_object(
    'reason', 'constraint_error',
    'fixed_at', NOW(),
    'minutes_inactive', EXTRACT(EPOCH FROM (NOW() - last_activity_at))/60
  ),
  'Sesión marcada como error debido a bug del constraint check_reservado_valid (ya corregido)'
FROM picking_libre_sessions
WHERE status = 'error'
  AND last_error = 'Error de constraint - stock reservado no pudo ser actualizado. Sistema corregido.';

-- Log de corrección
DO $$
DECLARE
  v_cleaned_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_cleaned_count
  FROM picking_libre_sessions
  WHERE status = 'error'
    AND last_error LIKE '%constraint%';
    
  RAISE LOG '[MIGRATION] Limpiadas % sesiones zombie por error de constraint', v_cleaned_count;
END $$;
