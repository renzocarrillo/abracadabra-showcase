
-- RPC para limpiar sesiones de picking libre antiguas o huérfanas
CREATE OR REPLACE FUNCTION cleanup_old_picking_sessions(
  p_hours_old integer DEFAULT 24
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  sessions_canceled INTEGER := 0;
  cutoff_time TIMESTAMP WITH TIME ZONE;
BEGIN
  cutoff_time := NOW() - (p_hours_old || ' hours')::INTERVAL;
  
  -- Cancel old sessions that are still 'en_proceso'
  WITH updated AS (
    UPDATE picking_libre_sessions
    SET 
      status = 'cancelado',
      completed_at = NOW()
    WHERE status = 'en_proceso'
      AND created_at < cutoff_time
    RETURNING id
  )
  SELECT COUNT(*) INTO sessions_canceled FROM updated;
  
  RETURN jsonb_build_object(
    'success', true,
    'sessions_canceled', sessions_canceled,
    'cutoff_hours', p_hours_old,
    'message', format('Canceled %s old picking sessions', sessions_canceled)
  );
END;
$$;

COMMENT ON FUNCTION cleanup_old_picking_sessions IS 'Cancels picking libre sessions older than specified hours that are still in progress';
