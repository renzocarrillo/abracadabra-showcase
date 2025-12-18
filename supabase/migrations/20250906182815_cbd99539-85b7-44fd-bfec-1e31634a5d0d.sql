-- Arreglar la política de administradores para evitar acceso a auth.users
-- Eliminar la política problemática
DROP POLICY IF EXISTS "Administradores pueden ver todos los perfiles" ON public.profiles;

-- Crear una política más simple que solo permita ver el propio perfil
-- Los administradores tendrán acceso a través de funciones específicas si es necesario
CREATE POLICY "Usuarios pueden ver su propio perfil"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);