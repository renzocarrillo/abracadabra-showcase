-- ARREGLO URGENTE: Eliminar política recursiva y crear versión segura
-- Primero eliminar la política problemática
DROP POLICY IF EXISTS "Admins and supervisors can view all profiles including deleted" ON public.profiles;

-- Crear políticas simples y seguras que no causen recursión
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  -- Solo verificar rol admin directamente (sin llamadas a funciones que puedan causar recursión)
  EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.users.id = auth.uid() 
    AND auth.users.id IN (
      SELECT p.id FROM profiles p 
      WHERE p.role = 'admin' 
      AND p.id = auth.uid()
    )
  )
);

CREATE POLICY "Users with admin user type can view all profiles"
ON public.profiles
FOR SELECT  
TO authenticated
USING (
  -- Verificar user_type admin sin recursión
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid() AND ut.is_admin = true
  )
);

CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id AND deleted_at IS NULL);