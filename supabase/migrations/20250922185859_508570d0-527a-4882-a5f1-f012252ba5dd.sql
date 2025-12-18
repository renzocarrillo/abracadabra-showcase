-- FASE 1: REMEDIACIÓN CRÍTICA DE SEGURIDAD (Corregida)
-- =====================================================

-- 1. SECURIZAR LOGS DE AUDITORÍA INMEDIATAMENTE
DROP POLICY IF EXISTS "Admin can view audit logs" ON public.security_audit_log;

-- CRÍTICO: Solo admins pueden ver logs de seguridad
CREATE POLICY "Only admins can view security audit logs" ON public.security_audit_log
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'::user_role AND deleted_at IS NULL
  )
);

-- CRÍTICO: Bloquear inserts directos de usuarios
DROP POLICY IF EXISTS "System can insert audit logs" ON public.security_audit_log;
CREATE POLICY "System only can insert security audit logs" ON public.security_audit_log
FOR INSERT WITH CHECK (false);

-- Función segura para logs de auditoría
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

-- 2. PROTEGER DATOS SENSIBLES DE CLIENTES
CREATE OR REPLACE FUNCTION public.mask_client_data(client_info jsonb, requesting_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  user_role text;
  is_admin boolean := false;
BEGIN
  -- Verificar si el usuario es admin
  SELECT role INTO user_role
  FROM public.profiles 
  WHERE id = requesting_user_id AND deleted_at IS NULL;
  
  IF user_role = 'admin' THEN
    is_admin := true;
  END IF;
  
  -- Verificar si tiene user_type admin
  IF NOT is_admin THEN
    SELECT ut.is_admin INTO is_admin
    FROM public.profiles p
    JOIN public.user_types ut ON p.user_type_id = ut.id
    WHERE p.id = requesting_user_id AND p.deleted_at IS NULL;
  END IF;
  
  -- Si es admin, devolver datos completos
  IF is_admin THEN
    RETURN client_info;
  END IF;
  
  -- Para no-admins, enmascarar datos sensibles
  RETURN jsonb_build_object(
    'nombre', COALESCE(client_info->>'nombre', 'Cliente'),
    'telefono', CASE 
      WHEN client_info->>'telefono' IS NOT NULL 
      THEN CONCAT('***-***-', RIGHT(client_info->>'telefono', 4))
      ELSE NULL
    END,
    'email', CASE 
      WHEN client_info->>'email' IS NOT NULL 
      THEN CONCAT(LEFT(client_info->>'email', 2), '***@***')
      ELSE NULL
    END,
    'direccion', CASE 
      WHEN client_info->>'direccion' IS NOT NULL 
      THEN 'Dirección confidencial'
      ELSE NULL
    END,
    'documento', CASE
      WHEN client_info->>'documento' IS NOT NULL
      THEN CONCAT('***', RIGHT(client_info->>'documento', 3))
      ELSE NULL
    END
  );
END;
$$;

-- 3. FUNCIÓN PARA VERIFICAR ACCESO A DATOS FINANCIEROS
CREATE OR REPLACE FUNCTION public.can_access_financial_data()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    LEFT JOIN public.user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid() 
    AND p.deleted_at IS NULL
    AND (
      p.role = 'admin'::user_role 
      OR ut.is_admin = true 
      OR ut.name IN ('supervisor', 'finance', 'manager')
    )
  );
$$;

-- 4. MEJORAR FUNCIÓN user_has_permission (MANTENER COMPATIBILIDAD)
CREATE OR REPLACE FUNCTION public.user_has_permission(permission_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  user_profile RECORD;
BEGIN
  -- Obtener perfil completo del usuario
  SELECT p.role, p.user_type_id, ut.is_admin, ut.name as user_type_name
  INTO user_profile
  FROM public.profiles p
  LEFT JOIN public.user_types ut ON p.user_type_id = ut.id
  WHERE p.id = auth.uid() AND p.deleted_at IS NULL;
  
  -- Si no existe perfil o está eliminado, denegar acceso
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Si es admin (cualquier sistema), permitir todo
  IF user_profile.role = 'admin'::user_role OR user_profile.is_admin THEN
    RETURN true;
  END IF;
  
  -- Si no tiene user_type_id, usar sistema de roles legacy
  IF user_profile.user_type_id IS NULL THEN
    -- Solo vendedoras tienen permisos básicos en sistema legacy
    RETURN user_profile.role = 'vendedora'::user_role AND permission_name IN (
      'view_orders', 'view_sales', 'create_orders', 'create_sales', 'view_products'
    );
  END IF;
  
  -- Verificar permisos específicos del user_type
  RETURN EXISTS (
    SELECT 1
    FROM public.user_type_permissions utp
    JOIN public.permissions perm ON utp.permission_id = perm.id
    WHERE utp.user_type_id = user_profile.user_type_id
    AND perm.name = permission_name
  );
END;
$$;

-- 5. SECURIZAR ACCESO A TIENDAS (DATOS CRÍTICOS DE NEGOCIO)
DROP POLICY IF EXISTS "Usuarios autenticados pueden leer tiendas" ON public.tiendas;
DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar tiendas" ON public.tiendas;
DROP POLICY IF EXISTS "Usuarios autenticados pueden insertar tiendas" ON public.tiendas;

-- Solo admins y usuarios autorizados pueden ver datos de tiendas
CREATE POLICY "Restricted store data access" ON public.tiendas
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    LEFT JOIN public.user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid() 
    AND p.deleted_at IS NULL
    AND (
      p.role = 'admin'::user_role 
      OR ut.is_admin = true
      OR ut.name IN ('supervisor', 'manager')
    )
  )
);

-- Solo admins pueden modificar tiendas
CREATE POLICY "Only admins can modify stores" ON public.tiendas
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() 
    AND p.deleted_at IS NULL
    AND p.role = 'admin'::user_role
  )
);

-- 6. LIMPIAR DATOS SENSIBLES EN LOGS EXISTENTES (CRÍTICO)
UPDATE public.security_audit_log 
SET details = CASE 
  WHEN details ? 'password' THEN details - 'password'
  WHEN details ? 'token' THEN details - 'token'  
  WHEN details ? 'email' THEN details - 'email'
  WHEN details ? 'user_agent' THEN details - 'user_agent'
  ELSE details
END
WHERE details IS NOT NULL;

-- 7. CREAR FUNCIÓN PARA REGISTRAR ACCESOS A DATOS SENSIBLES
CREATE OR REPLACE FUNCTION public.log_sensitive_data_access(
  table_name text,
  record_id text,
  operation text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Solo registrar si es una operación en tabla sensible
  IF table_name IN ('ventas', 'profiles', 'security_audit_log', 'tiendas') THEN
    PERFORM public.insert_security_audit_log(
      auth.uid(),
      operation || '_sensitive_data',
      table_name,
      record_id,
      jsonb_build_object(
        'table', table_name,
        'operation', operation,
        'timestamp', now(),
        'user_agent', current_setting('request.headers')::json->>'user-agent'
      )
    );
  END IF;
END;
$$;

-- 8. CREAR VISTA SEGURA PARA VENTAS CON DATOS ENMASCARADOS
CREATE OR REPLACE VIEW public.ventas_secure AS
SELECT 
  v.id,
  v.venta_id,
  v.estado,
  v.created_at,
  v.updated_at,
  -- Enmascarar datos del cliente según el usuario
  CASE 
    WHEN public.can_access_financial_data() THEN v.cliente_info
    ELSE public.mask_client_data(v.cliente_info, auth.uid())
  END as cliente_info,
  -- Mostrar datos financieros solo a usuarios autorizados
  CASE 
    WHEN public.can_access_financial_data() THEN v.total
    ELSE 0
  END as total,
  CASE 
    WHEN public.can_access_financial_data() THEN v.subtotal
    ELSE 0
  END as subtotal,
  CASE 
    WHEN public.can_access_financial_data() THEN v.igv
    ELSE 0
  END as igv,
  -- Campos no sensibles siempre visibles
  v.metodo_pago,
  v.notas,
  v.serial_number,
  v.url_public_view
FROM public.ventas v
WHERE EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE id = auth.uid() 
  AND deleted_at IS NULL
  AND (role IN ('admin', 'vendedora') OR public.user_has_permission('view_sales'))
);

-- 9. BLOQUEAR MODIFICACIONES A LOGS POR USUARIOS
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "System only can insert security audit logs" ON public.security_audit_log;
CREATE POLICY "Block direct user modifications" ON public.security_audit_log
FOR ALL USING (false);

-- Solo la función del sistema puede insertar
CREATE POLICY "System function can insert audit logs" ON public.security_audit_log
FOR INSERT WITH CHECK (
  -- Solo permitir si viene de la función de sistema (verificar context)
  current_setting('role', true) = 'supabase_admin'
  OR pg_has_role('supabase_admin', 'member')
);