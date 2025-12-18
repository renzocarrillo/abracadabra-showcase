-- Limpiar sesión atorada en 'emitiendo' para permitir reintento
UPDATE picking_libre_sessions
SET 
  status = 'verificado',
  last_error = 'Sesión atorada en emitiendo - revertida para permitir reintento',
  updated_at = NOW()
WHERE id = '336f3fa3-24ac-4605-b76b-beab8d8e0bc3'
  AND status = 'emitiendo';

-- Log de auditoría
INSERT INTO picking_libre_audit_log (session_id, event_type, event_status, details)
VALUES (
  '336f3fa3-24ac-4605-b76b-beab8d8e0bc3',
  'SESSION_UNSTUCK',
  'success',
  '{"reason": "Revertida de emitiendo a verificado para permitir reintento tras error de BSale"}'::jsonb
);