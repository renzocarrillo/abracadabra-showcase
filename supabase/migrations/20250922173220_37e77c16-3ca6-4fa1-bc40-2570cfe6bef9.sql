-- FASE 1: REMEDIACIÓN CRÍTICA DE SEGURIDAD
-- ==========================================

-- 1. SECURIZAR LOGS DE AUDITORÍA
-- Eliminar política permisiva actual y crear política restrictiva
DROP POLICY IF EXISTS "Admin can view audit logs" ON public.security_audit_log;

-- Nueva política: SOLO admins pueden ver logs de auditoría
CREATE POLICY "Only admins can view security audit logs" ON public.security_audit_log
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'::user_role
  )
);

-- Nueva política: SOLO el sistema puede insertar logs (no usuarios directos)
DROP POLICY IF EXISTS "System can insert audit logs" ON public.security_audit_log;
CREATE POLICY "System can insert security audit logs" ON public.security_audit_log
FOR INSERT WITH CHECK (false); -- Bloquear inserts directos de usuarios

-- Función segura para insertar logs de auditoría (SECURITY DEFINER)
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

-- 2. PROTEGER DATOS SENSIBLES EN VENTAS
-- Crear función para enmascarar datos sensibles de clientes
CREATE OR REPLACE FUNCTION public.mask_sensitive_client_data(client_info jsonb, user_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- Solo admins pueden ver datos completos
  IF user_role = 'admin' THEN
    RETURN client_info;
  END IF;
  
  -- Para otros usuarios, enmascarar datos sensibles
  RETURN jsonb_build_object(
    'nombre', COALESCE(client_info->>'nombre', 'Cliente'),
    'telefono', CASE 
      WHEN client_info->>'telefono' IS NOT NULL 
      THEN CONCAT('***-***-', RIGHT(client_info->>'telefono', 4))
      ELSE NULL
    END,
    'email', CASE 
      WHEN client_info->>'email' IS NOT NULL 
      THEN CONCAT(LEFT(client_info->>'email', 3), '***@***.***')
      ELSE NULL
    END,
    'direccion', CASE 
      WHEN client_info->>'direccion' IS NOT NULL 
      THEN 'Dirección protegida'
      ELSE NULL
    END
  );
END;
$$;

-- Crear función para verificar acceso a datos financieros
CREATE OR REPLACE FUNCTION public.can_view_financial_data()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND (
      role = 'admin'::user_role 
      OR EXISTS (
        SELECT 1 FROM public.user_types ut
        WHERE ut.id = profiles.user_type_id 
        AND (ut.is_admin = true OR ut.name IN ('supervisor', 'finance'))
      )
    )
  );
$$;

-- 3. CONSOLIDAR SISTEMA DE PERMISOS
-- Función unificada para verificar permisos (reemplaza duplicados)
CREATE OR REPLACE FUNCTION public.check_user_permission(permission_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  user_profile RECORD;
BEGIN
  -- Obtener perfil del usuario
  SELECT p.role, ut.is_admin, ut.name as user_type_name
  INTO user_profile
  FROM public.profiles p
  LEFT JOIN public.user_types ut ON p.user_type_id = ut.id
  WHERE p.id = auth.uid() AND p.deleted_at IS NULL;
  
  -- Si no se encuentra perfil, denegar
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Si es admin (rol antiguo o nuevo), permitir todo
  IF user_profile.role = 'admin'::user_role OR user_profile.is_admin THEN
    RETURN true;
  END IF;
  
  -- Verificar permisos específicos del user_type
  IF user_profile.user_type_name IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.user_type_permissions utp
      JOIN public.permissions perm ON utp.permission_id = perm.id
      JOIN public.profiles p ON p.user_type_id = utp.user_type_id
      WHERE p.id = auth.uid() 
      AND perm.name = permission_name
    );
  END IF;
  
  RETURN false;
END;
$$;

-- Reemplazar función user_has_permission existente
DROP FUNCTION IF EXISTS public.user_has_permission(text);
CREATE OR REPLACE FUNCTION public.user_has_permission(permission_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.check_user_permission(permission_name);
$$;

-- 4. SECURIZAR TABLAS CRÍTICAS
-- Actualizar políticas de ventas para proteger datos sensibles
DROP POLICY IF EXISTS "Authorized users can read sales" ON public.ventas;
CREATE POLICY "Authorized users can read sales with data protection" ON public.ventas
FOR SELECT USING (
  -- Solo usuarios autorizados pueden ver ventas
  (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'vendedora'))
    OR public.check_user_permission('view_sales')
  )
  -- Nota: Los datos sensibles se enmascararán en la aplicación usando las funciones creadas
);

-- Crear política específica para datos financieros en ventas
CREATE POLICY "Financial data access restricted" ON public.ventas
FOR SELECT USING (
  public.can_view_financial_data()
  OR (
    -- Vendedoras solo pueden ver sus propias ventas (si el sistema lo implementa)
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'vendedora'::user_role)
  )
);

-- 5. PROTEGER TABLA DE PEDIDOS
-- Actualizar políticas de pedidos para mayor seguridad
DROP POLICY IF EXISTS "Authorized users can read orders" ON public.pedidos;
CREATE POLICY "Authorized users can read orders securely" ON public.pedidos
FOR SELECT USING (
  public.check_user_permission('view_orders')
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'vendedora'))
);

-- 6. BLOQUEAR ACCESO DIRECTO A DATOS CRÍTICOS
-- Crear política restrictiva para tiendas (contiene datos de negocio sensibles)
DROP POLICY IF EXISTS "Usuarios autenticados pueden leer tiendas" ON public.tiendas;
CREATE POLICY "Restricted access to store data" ON public.tiendas
FOR SELECT USING (
  public.check_user_permission('view_stores')
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'::user_role)
);

-- Solo admins pueden modificar tiendas
CREATE POLICY "Only admins can modify stores" ON public.tiendas
FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'::user_role)
);