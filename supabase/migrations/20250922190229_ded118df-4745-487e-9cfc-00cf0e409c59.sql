-- CORRECCIÓN FINAL DE SEGURIDAD - DEFINIR FUNCIONES FALTANTES
-- ===========================================================

-- 1. CREAR LA FUNCIÓN DE AUDITORÍA QUE FALTA
CREATE OR REPLACE FUNCTION public.auto_audit_sensitive_operations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Auditar operaciones en tablas sensibles
  IF TG_TABLE_NAME IN ('ventas', 'profiles', 'tiendas', 'pedidos') AND TG_OP IN ('INSERT', 'UPDATE', 'DELETE') THEN
    -- Usar función system_insert que omite RLS
    PERFORM public.system_insert_audit_log(
      auth.uid(),
      TG_OP || '_' || TG_TABLE_NAME,
      TG_TABLE_NAME,
      CASE 
        WHEN TG_OP = 'DELETE' THEN OLD.id::text
        ELSE NEW.id::text
      END,
      jsonb_build_object(
        'operation', TG_OP,
        'table', TG_TABLE_NAME,
        'timestamp', now()
      )
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 2. CREAR LA FUNCIÓN system_insert_audit_log (bypass RLS)
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
  -- Esta función bypass RLS usando SECURITY DEFINER
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
    COALESCE(p_details, '{}'::jsonb),
    p_ip_address,
    p_user_agent,
    now()
  );
  
  RETURN true;
END;
$$;

-- 3. APLICAR TRIGGERS CORRECTAMENTE (AHORA QUE LA FUNCIÓN EXISTE)
DROP TRIGGER IF EXISTS auto_audit_ventas ON public.ventas;
CREATE TRIGGER auto_audit_ventas
  AFTER INSERT OR UPDATE OR DELETE ON public.ventas
  FOR EACH ROW EXECUTE FUNCTION public.auto_audit_sensitive_operations();

DROP TRIGGER IF EXISTS auto_audit_profiles ON public.profiles;
CREATE TRIGGER auto_audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.auto_audit_sensitive_operations();

DROP TRIGGER IF EXISTS auto_audit_tiendas ON public.tiendas;
CREATE TRIGGER auto_audit_tiendas
  AFTER INSERT OR UPDATE OR DELETE ON public.tiendas
  FOR EACH ROW EXECUTE FUNCTION public.auto_audit_sensitive_operations();

-- 4. POLÍTICAS ULTRA-RESTRICTIVAS PARA LOGS DE AUDITORÍA
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Eliminar todas las políticas existentes
DROP POLICY IF EXISTS "Only admins can view security audit logs" ON public.security_audit_log;
DROP POLICY IF EXISTS "System only can insert security audit logs" ON public.security_audit_log;
DROP POLICY IF EXISTS "Ultra secure audit log access" ON public.security_audit_log;
DROP POLICY IF EXISTS "Block all modifications to audit logs" ON public.security_audit_log;

-- Nueva política: SOLO lectura para admins
CREATE POLICY "Admins read only audit logs" ON public.security_audit_log
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role = 'admin'::user_role 
    AND deleted_at IS NULL
  )
);

-- Bloquear TODAS las modificaciones directas
CREATE POLICY "Block all direct modifications" ON public.security_audit_log
FOR ALL USING (false);

-- 5. CREAR FUNCIÓN SEGURA PARA OBTENER VENTAS (REEMPLAZA LA VISTA)
CREATE OR REPLACE FUNCTION public.get_secure_sales(
  limit_count integer DEFAULT 50,
  offset_count integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  venta_id text,
  estado venta_estado,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  cliente_info jsonb,
  total numeric,
  subtotal numeric,
  igv numeric,
  metodo_pago text,
  notas text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  can_view_financial boolean := false;
  user_is_authorized boolean := false;
BEGIN
  -- Verificar autorización básica
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND deleted_at IS NULL 
    AND (role IN ('admin', 'vendedora') OR public.user_has_permission('view_sales'))
  ) INTO user_is_authorized;
  
  IF NOT user_is_authorized THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Verificar acceso a datos financieros
  SELECT public.can_access_financial_data() INTO can_view_financial;
  
  RETURN QUERY
  SELECT 
    v.id,
    v.venta_id,
    v.estado,
    v.created_at,
    v.updated_at,
    CASE 
      WHEN can_view_financial THEN v.cliente_info
      ELSE public.mask_client_data(v.cliente_info, auth.uid())
    END,
    CASE 
      WHEN can_view_financial THEN v.total
      ELSE 0::numeric
    END,
    CASE 
      WHEN can_view_financial THEN v.subtotal
      ELSE 0::numeric
    END,
    CASE 
      WHEN can_view_financial THEN v.igv
      ELSE 0::numeric
    END,
    v.metodo_pago,
    v.notas
  FROM public.ventas v
  ORDER BY v.created_at DESC
  LIMIT limit_count
  OFFSET offset_count;
END;
$$;

-- 6. FUNCIÓN PARA LIMPIAR DATOS SENSIBLES DE LOGS EXISTENTES
CREATE OR REPLACE FUNCTION public.sanitize_audit_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cleaned_count integer := 0;
BEGIN
  -- Solo admins pueden ejecutar
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'::user_role AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Limpiar campos sensibles en detalles JSON
  UPDATE public.security_audit_log 
  SET 
    details = COALESCE(
      details 
      - 'password' 
      - 'token' 
      - 'email' 
      - 'user_agent' 
      - 'ip_address',
      '{}'::jsonb
    ),
    ip_address = NULL,
    user_agent = NULL
  WHERE details IS NOT NULL 
     OR ip_address IS NOT NULL 
     OR user_agent IS NOT NULL;
  
  GET DIAGNOSTICS cleaned_count = ROW_COUNT;
  
  RETURN cleaned_count;
END;
$$;