-- Actualizar políticas RLS para productos_congelados de forma más robusta
DROP POLICY IF EXISTS "Admin can manage frozen products" ON public.productos_congelados;
DROP POLICY IF EXISTS "Authenticated users can read frozen products" ON public.productos_congelados;

-- Política simple: todos los usuarios autenticados pueden leer productos congelados
CREATE POLICY "Everyone can read frozen products" ON public.productos_congelados
FOR SELECT TO authenticated
USING (true);

-- Política para gestión: usuarios con role admin o permisos específicos
CREATE POLICY "Authorized users can manage frozen products" ON public.productos_congelados
FOR ALL TO authenticated
USING (
    -- Permitir si el usuario tiene role admin en la tabla profiles
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND role = 'admin'
    )
    OR
    -- O si tiene el permiso específico a través del nuevo sistema
    EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.user_types ut ON p.user_type_id = ut.id
        WHERE p.id = auth.uid() 
        AND ut.is_admin = true
    )
    OR
    -- O si tiene permisos específicos de productos congelados
    EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.user_type_permissions utp ON p.user_type_id = utp.user_type_id
        JOIN public.permissions perm ON utp.permission_id = perm.id
        WHERE p.id = auth.uid()
        AND perm.name IN ('manage_frozen_products', 'view_frozen_products')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND role = 'admin'
    )
    OR
    EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.user_types ut ON p.user_type_id = ut.id
        WHERE p.id = auth.uid() 
        AND ut.is_admin = true
    )
    OR
    EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.user_type_permissions utp ON p.user_type_id = utp.user_type_id
        JOIN public.permissions perm ON utp.permission_id = perm.id
        WHERE p.id = auth.uid()
        AND perm.name = 'manage_frozen_products'
    )
);