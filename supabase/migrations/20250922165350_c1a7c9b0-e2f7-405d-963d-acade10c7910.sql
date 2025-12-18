-- Ensure pgcrypto is installed in the extensions schema (Supabase convention)
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Recreate function with proper search_path so pgcrypto.diges t is available
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
SET search_path = public, extensions
AS $$
BEGIN
  RETURN encode(
    extensions.digest(
      concat(p_order_id::text, p_order_type, p_signed_by::text, extract(epoch from p_signed_at)::text),
      'sha256'
    ),
    'hex'
  );
END;
$$;

-- Grant execute to API roles
GRANT EXECUTE ON FUNCTION public.generate_signature_hash(uuid, text, uuid, timestamp with time zone) TO anon, authenticated;