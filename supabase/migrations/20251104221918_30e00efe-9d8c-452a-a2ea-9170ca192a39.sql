-- Create SECURITY DEFINER function to log signature attempts (bypassing RLS)
CREATE OR REPLACE FUNCTION public.log_signature_attempt(
  p_user_id uuid,
  p_action text,
  p_table_name text,
  p_record_id text,
  p_details jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.security_audit_log (user_id, action, table_name, record_id, details)
  VALUES (p_user_id, p_action, p_table_name, p_record_id, p_details);
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_signature_attempt(uuid, text, text, text, jsonb) TO authenticated;
