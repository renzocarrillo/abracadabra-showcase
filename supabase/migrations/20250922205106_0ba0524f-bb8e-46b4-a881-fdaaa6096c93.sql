-- Solución final: políticas ultra-simples sin recursión posible
-- Eliminar todas las políticas existentes
DROP POLICY IF EXISTS "Profiles access control" ON public.profiles;
DROP POLICY IF EXISTS "Admin user type can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Crear funciones helper SECURITY DEFINER para evitar recursión
CREATE OR REPLACE FUNCTION public.get_current_user_profile_role()
RETURNS TEXT AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role::text INTO user_role 
    FROM public.profiles 
    WHERE id = auth.uid() LIMIT 1;
    RETURN user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_current_user_admin_type()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM public.profiles p
        JOIN public.user_types ut ON p.user_type_id = ut.id
        WHERE p.id = auth.uid() AND ut.is_admin = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Política simple usando las funciones SECURITY DEFINER
CREATE POLICY "Profiles visibility"
ON public.profiles
FOR SELECT
TO authenticated
USING (
    -- Ver propio perfil
    auth.uid() = id 
    OR 
    -- Admins pueden ver todo
    public.get_current_user_profile_role() = 'admin'
    OR
    -- User types admin pueden ver todo  
    public.is_current_user_admin_type() = true
);