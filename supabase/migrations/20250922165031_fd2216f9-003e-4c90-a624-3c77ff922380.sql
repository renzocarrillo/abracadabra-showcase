-- Enable pgcrypto extension for digest and encode functions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Update generate_signature_hash function to ensure it works with pgcrypto
CREATE OR REPLACE FUNCTION public.generate_signature_hash(p_order_id uuid, p_order_type text, p_signed_by uuid, p_signed_at timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN encode(
        digest(
            concat(p_order_id::text, p_order_type, p_signed_by::text, extract(epoch from p_signed_at)::text),
            'sha256'
        ),
        'hex'
    );
END;
$function$;