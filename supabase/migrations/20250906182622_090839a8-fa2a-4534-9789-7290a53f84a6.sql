-- Arreglar el problema de recursión infinita en las políticas de profiles
-- Eliminar la política problemática que causa recursión infinita
DROP POLICY IF EXISTS "Los administradores pueden ver todos los perfiles" ON public.profiles;

-- Crear una política más simple para administradores que no cause recursión
-- Los administradores podrán ver todos los perfiles si su propio perfil tiene rol 'admin'
CREATE POLICY "Administradores pueden ver todos los perfiles"
ON public.profiles FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.users.id = auth.uid() 
    AND auth.users.raw_user_meta_data->>'role' = 'admin'
  )
  OR auth.uid() = id
);