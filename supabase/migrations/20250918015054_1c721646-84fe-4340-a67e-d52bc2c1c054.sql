-- Crear tabla de permisos disponibles en el sistema
CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Crear tabla de tipos de usuarios
CREATE TABLE IF NOT EXISTS public.user_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Crear tabla de relación entre tipos de usuarios y permisos
CREATE TABLE IF NOT EXISTS public.user_type_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_type_id UUID NOT NULL REFERENCES public.user_types(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_type_id, permission_id)
);

-- Actualizar la tabla profiles para usar user_type_id en lugar de role
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_type_id UUID REFERENCES public.user_types(id);

-- Habilitar RLS en las nuevas tablas
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_type_permissions ENABLE ROW LEVEL SECURITY;

-- Crear políticas RLS
CREATE POLICY "Authenticated users can read permissions" 
ON public.permissions 
FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage permissions" 
ON public.permissions 
FOR ALL 
USING (user_has_role('admin'::text));

CREATE POLICY "Authenticated users can read user types" 
ON public.user_types 
FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage user types" 
ON public.user_types 
FOR ALL 
USING (user_has_role('admin'::text));

CREATE POLICY "Authenticated users can read user type permissions" 
ON public.user_type_permissions 
FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage user type permissions" 
ON public.user_type_permissions 
FOR ALL 
USING (user_has_role('admin'::text));

-- Insertar permisos básicos del sistema
INSERT INTO public.permissions (name, display_name, description, category) VALUES
('view_dashboard', 'Ver Dashboard', 'Acceso al panel principal del sistema', 'dashboard'),
('manage_orders', 'Gestionar Pedidos', 'Crear, editar y gestionar pedidos', 'orders'),
('view_orders', 'Ver Pedidos', 'Ver lista de pedidos', 'orders'),
('delete_orders', 'Eliminar Pedidos', 'Eliminar pedidos del sistema', 'orders'),
('manage_sales', 'Gestionar Ventas', 'Crear, editar y gestionar ventas', 'sales'),
('view_sales', 'Ver Ventas', 'Ver lista de ventas', 'sales'),
('delete_sales', 'Eliminar Ventas', 'Eliminar ventas del sistema', 'sales'),
('manage_inventory', 'Gestionar Inventario', 'Gestión completa del inventario', 'inventory'),
('view_inventory', 'Ver Inventario', 'Ver estado del inventario', 'inventory'),
('manage_stock', 'Gestionar Stock', 'Entradas y salidas de stock', 'inventory'),
('manage_bins', 'Gestionar Bins', 'Gestión de ubicaciones de productos', 'inventory'),
('manage_users', 'Gestionar Usuarios', 'Crear, editar y gestionar usuarios', 'admin'),
('manage_user_types', 'Gestionar Tipos de Usuario', 'Crear y gestionar tipos de usuario y permisos', 'admin'),
('view_audit_logs', 'Ver Logs de Auditoría', 'Acceso a registros de auditoría', 'admin'),
('manage_shopify', 'Gestionar Shopify', 'Gestión de integración con Shopify', 'integrations'),
('manage_physical_stores', 'Gestionar Tiendas Físicas', 'Gestión de pedidos de tiendas físicas', 'stores'),
('picking_operations', 'Operaciones de Picking', 'Realizar operaciones de picking y preparación', 'operations')
ON CONFLICT (name) DO NOTHING;

-- Insertar tipos de usuario básicos
INSERT INTO public.user_types (name, display_name, description, is_admin) VALUES
('admin', 'Administrador', 'Acceso completo al sistema', true),
('vendedora', 'Vendedora', 'Acceso básico para ventas y consultas', false),
('picker', 'Picker', 'Acceso para operaciones de picking', false),
('supervisor', 'Supervisor', 'Acceso amplio sin gestión de usuarios', false)
ON CONFLICT (name) DO NOTHING;

-- Asignar todos los permisos al tipo Admin
INSERT INTO public.user_type_permissions (user_type_id, permission_id)
SELECT 
  (SELECT id FROM public.user_types WHERE name = 'admin'),
  p.id
FROM public.permissions p
ON CONFLICT (user_type_id, permission_id) DO NOTHING;

-- Asignar permisos básicos a Vendedora
INSERT INTO public.user_type_permissions (user_type_id, permission_id)
SELECT 
  (SELECT id FROM public.user_types WHERE name = 'vendedora'),
  p.id
FROM public.permissions p
WHERE p.name IN ('view_dashboard', 'view_orders', 'manage_sales', 'view_sales', 'view_inventory')
ON CONFLICT (user_type_id, permission_id) DO NOTHING;

-- Asignar permisos a Picker
INSERT INTO public.user_type_permissions (user_type_id, permission_id)
SELECT 
  (SELECT id FROM public.user_types WHERE name = 'picker'),
  p.id
FROM public.permissions p
WHERE p.name IN ('view_dashboard', 'view_orders', 'view_sales', 'picking_operations', 'view_inventory')
ON CONFLICT (user_type_id, permission_id) DO NOTHING;

-- Crear función para verificar permisos de usuario
CREATE OR REPLACE FUNCTION public.user_has_permission(permission_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_profile RECORD;
BEGIN
  -- Obtener el perfil del usuario actual
  SELECT ut.is_admin, ut.id as user_type_id
  INTO user_profile
  FROM public.profiles p
  JOIN public.user_types ut ON p.user_type_id = ut.id
  WHERE p.id = auth.uid();
  
  -- Si no se encuentra perfil, denegar acceso
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Si es admin, permitir todo
  IF user_profile.is_admin THEN
    RETURN TRUE;
  END IF;
  
  -- Verificar si el tipo de usuario tiene el permiso específico
  RETURN EXISTS (
    SELECT 1
    FROM public.user_type_permissions utp
    JOIN public.permissions perm ON utp.permission_id = perm.id
    WHERE utp.user_type_id = user_profile.user_type_id
      AND perm.name = permission_name
  );
END;
$$;