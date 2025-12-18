-- Secure digital signature RPCs to bypass RLS safely
DO $$ BEGIN
  -- validate_signature_pin(text)
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'validate_signature_pin'
  ) THEN
    ALTER FUNCTION public.validate_signature_pin(text)
      SECURITY DEFINER
      SET search_path = public;
    GRANT EXECUTE ON FUNCTION public.validate_signature_pin(text) TO anon, authenticated;
  END IF;

  -- generate_signature_hash(uuid, text, uuid, timestamptz)
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'generate_signature_hash'
  ) THEN
    ALTER FUNCTION public.generate_signature_hash(uuid, text, uuid, timestamptz)
      SECURITY DEFINER
      SET search_path = public;
    GRANT EXECUTE ON FUNCTION public.generate_signature_hash(uuid, text, uuid, timestamptz) TO anon, authenticated;
  END IF;

  -- user_has_signature_pin()
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'user_has_signature_pin'
  ) THEN
    ALTER FUNCTION public.user_has_signature_pin()
      SECURITY DEFINER
      SET search_path = public;
    GRANT EXECUTE ON FUNCTION public.user_has_signature_pin() TO anon, authenticated;
  END IF;

  -- can_sign_with_pin()
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'can_sign_with_pin'
  ) THEN
    ALTER FUNCTION public.can_sign_with_pin()
      SECURITY DEFINER
      SET search_path = public;
    GRANT EXECUTE ON FUNCTION public.can_sign_with_pin() TO anon, authenticated;
  END IF;
END $$;

-- Ensure audit log table allows authenticated inserts
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'security_audit_log'
  ) THEN
    -- If table doesn't exist, do nothing
    RAISE NOTICE 'security_audit_log table not found, skipping policies.';
  ELSE
    -- Enable RLS if not enabled
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'security_audit_log' AND c.relrowsecurity
    ) THEN
      ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;
    END IF;

    -- Allow authenticated users to insert audit events
    DROP POLICY IF EXISTS "Authenticated can insert audit log" ON public.security_audit_log;
    CREATE POLICY "Authenticated can insert audit log"
      ON public.security_audit_log
      FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

-- Ensure order_signatures select is open to authenticated (idempotent)
DROP POLICY IF EXISTS "Authenticated users can view signatures" ON public.order_signatures;
CREATE POLICY "Authenticated users can view signatures" 
ON public.order_signatures 
FOR SELECT 
TO authenticated
USING (true);
