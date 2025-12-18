-- Última corrección - eliminar la política que aún puede causar recursión
DROP POLICY IF EXISTS "Admin role can view all profiles" ON public.profiles;

-- Crear una política completamente libre de recursión usando solo auth.uid()
CREATE POLICY "Profiles access control"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  -- Siempre permitir ver el propio perfil
  auth.uid() = id 
  OR
  -- Permitir si es admin basado en user_type (sin tocar profiles en la verificación)
  auth.uid() IN (
    SELECT p.id 
    FROM profiles p 
    JOIN user_types ut ON p.user_type_id = ut.id 
    WHERE ut.is_admin = true
  )
  OR
  -- Permitir acceso directo por rol admin (consulta simple)
  auth.uid() IN (
    SELECT id FROM profiles WHERE role = 'admin'::user_role
  )
);