-- Create a simpler version that definitely works
CREATE OR REPLACE FUNCTION public.generate_signature_hash(
  p_order_id uuid,
  p_order_type text,
  p_signed_by uuid,
  p_signed_at timestamp with time zone
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  input_string text;
  hash_bytes bytea;
BEGIN
  -- Concatenate all input parameters
  input_string := p_order_id::text || p_order_type || p_signed_by::text || extract(epoch from p_signed_at)::text;
  
  -- Generate SHA256 hash using full schema path
  SELECT extensions.digest(input_string, 'sha256') INTO hash_bytes;
  
  -- Encode as hex
  RETURN encode(hash_bytes, 'hex');
END;
$$;

-- Ensure proper permissions
GRANT EXECUTE ON FUNCTION public.generate_signature_hash(uuid, text, uuid, timestamp with time zone) TO anon, authenticated;