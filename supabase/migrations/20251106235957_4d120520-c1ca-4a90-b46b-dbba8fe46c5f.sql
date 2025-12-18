-- Create new function that only validates and prepares (doesn't complete the session)
-- This replaces complete_picking_libre_safe to fix the issue where sessions were marked
-- as completed before Bsale document emission succeeded

CREATE OR REPLACE FUNCTION validate_picking_libre_session(
  p_session_id uuid,
  p_tienda_id uuid,
  p_documento_tipo text,
  p_transportista_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  session_record RECORD;
BEGIN
  -- Verify that the session exists and is in process
  SELECT * INTO session_record
  FROM picking_libre_sessions
  WHERE id = p_session_id AND status = 'en_proceso';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Session not found or already completed'
    );
  END IF;
  
  -- Only update metadata, NOT the status nor completed_at
  -- Status will be updated by edge functions after successful Bsale emission
  UPDATE picking_libre_sessions
  SET 
    tienda_destino_id = p_tienda_id,
    transportista_id = p_transportista_id,
    documento_tipo = p_documento_tipo,
    updated_at = now()
  WHERE id = p_session_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Session validated and ready for document emission'
  );
END;
$$;

-- Add comment explaining the change
COMMENT ON FUNCTION validate_picking_libre_session IS 
'Validates and prepares a free picking session for document emission. 
Does NOT change status to completado - that is done by edge functions after successful Bsale emission.
This prevents sessions from being stuck in completed status without a document.';