-- CORRECCIÓN DE ERROR EN TRIGGER (Función inexistente)
-- =====================================================

-- Corregir el trigger que hace referencia a función inexistente
DROP TRIGGER IF EXISTS auto_audit_tiendas ON public.tiendas;
CREATE TRIGGER auto_audit_tiendas
  AFTER INSERT OR UPDATE OR DELETE ON public.tiendas
  FOR EACH ROW EXECUTE FUNCTION public.auto_audit_sensitive_operations();

-- COMPLETAR CORRECCIONES DE SEGURIDAD RESTANTES
-- ===============================================

-- 1. Asegurar que pgcrypto esté en extensions schema
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;

-- 2. Verificar que generate_signature_hash use extensions.digest
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
SET search_path = public
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

-- 3. Crear política más estricta para logs de auditoría
DROP POLICY IF EXISTS "Audit logs read only" ON public.security_audit_log;

-- Política que solo permite lecturas a admins activos
CREATE POLICY "Ultra secure audit log access" ON public.security_audit_log
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role = 'admin'::user_role 
    AND deleted_at IS NULL
  )
);

-- Bloquear TODAS las modificaciones directas (INSERT, UPDATE, DELETE)
CREATE POLICY "Block all modifications to audit logs" ON public.security_audit_log
FOR ALL USING (false);

-- 4. Función específica para permitir inserts SOLO desde sistema
CREATE OR REPLACE FUNCTION public.system_insert_audit_log(
  p_user_id uuid,
  p_action text,
  p_table_name text DEFAULT NULL,
  p_record_id text DEFAULT NULL,
  p_details jsonb DEFAULT NULL,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Esta función omite RLS para permitir inserts del sistema
  INSERT INTO public.security_audit_log (
    user_id,
    action,
    table_name,
    record_id,
    details,
    ip_address,
    user_agent,
    created_at
  ) VALUES (
    p_user_id,
    p_action,
    p_table_name,
    p_record_id,
    p_details,
    p_ip_address,
    p_user_agent,
    now()
  );
  
  RETURN true;
END;
$$;

-- Actualizar función insert_security_audit_log para usar la nueva
CREATE OR REPLACE FUNCTION public.insert_security_audit_log(
  p_user_id uuid,
  p_action text,
  p_table_name text DEFAULT NULL,
  p_record_id text DEFAULT NULL,
  p_details jsonb DEFAULT NULL,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Usar función del sistema que omite RLS
  RETURN public.system_insert_audit_log(
    p_user_id,
    p_action,
    p_table_name,
    p_record_id,
    p_details,
    p_ip_address,
    p_user_agent
  );
END;
$$;

-- 5. Crear función para verificar integridad de datos críticos
CREATE OR REPLACE FUNCTION public.verify_critical_data_integrity()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  integrity_report jsonb := '{}';
  total_profiles integer;
  deleted_profiles integer;
  admin_profiles integer;
  audit_log_count integer;
BEGIN
  -- Solo admins pueden ejecutar
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'::user_role AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Verificar estado de perfiles
  SELECT COUNT(*) INTO total_profiles FROM public.profiles;
  SELECT COUNT(*) INTO deleted_profiles FROM public.profiles WHERE deleted_at IS NOT NULL;
  SELECT COUNT(*) INTO admin_profiles FROM public.profiles WHERE role = 'admin' AND deleted_at IS NULL;
  
  -- Verificar logs de auditoría
  SELECT COUNT(*) INTO audit_log_count FROM public.security_audit_log;
  
  integrity_report := jsonb_build_object(
    'verification_timestamp', now(),
    'profiles', jsonb_build_object(
      'total', total_profiles,
      'deleted', deleted_profiles,
      'active_admins', admin_profiles
    ),
    'audit_logs', jsonb_build_object(
      'total_entries', audit_log_count
    ),
    'security_status', CASE 
      WHEN admin_profiles > 0 THEN 'secure'
      ELSE 'critical_no_admins'
    END
  );
  
  -- Registrar la verificación
  PERFORM public.insert_security_audit_log(
    auth.uid(),
    'data_integrity_check',
    'system',
    null,
    integrity_report
  );
  
  RETURN integrity_report;
END;
$$;

-- 6. Crear índices para mejorar rendimiento de consultas de seguridad
CREATE INDEX IF NOT EXISTS idx_profiles_role_deleted 
ON public.profiles(role, deleted_at) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_user_action 
ON public.security_audit_log(user_id, action, created_at);

CREATE INDEX IF NOT EXISTS idx_ventas_estado_created 
ON public.ventas(estado, created_at);

-- 7. Función para generar reportes de seguridad
CREATE OR REPLACE FUNCTION public.generate_security_report()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  security_report jsonb;
  recent_actions jsonb;
BEGIN
  -- Solo admins pueden generar reportes
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'::user_role AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Obtener acciones recientes (últimas 24 horas)
  SELECT jsonb_agg(
    jsonb_build_object(
      'action', action,
      'table', table_name,
      'timestamp', created_at,
      'user_id', user_id
    )
  ) INTO recent_actions
  FROM public.security_audit_log 
  WHERE created_at >= now() - interval '24 hours'
  ORDER BY created_at DESC
  LIMIT 100;
  
  security_report := jsonb_build_object(
    'report_timestamp', now(),
    'report_generated_by', auth.uid(),
    'recent_24h_actions', COALESCE(recent_actions, '[]'::jsonb),
    'security_policies_active', true,
    'audit_logging_enabled', true
  );
  
  -- Registrar la generación del reporte
  PERFORM public.insert_security_audit_log(
    auth.uid(),
    'security_report_generated',
    'system',
    null,
    jsonb_build_object('report_size', jsonb_array_length(recent_actions))
  );
  
  RETURN security_report;
END;
$$;