-- Eliminar TODAS las políticas problemáticas y crear versiones ultra-simples
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admin user types can view all profiles" ON public.profiles;

-- Política ultra-simple para administradores usando solo el enum role
CREATE POLICY "Admin role can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  -- Solo verificar el rol directo sin funciones helper
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- Política para users con tipo admin (sin recursión)  
CREATE POLICY "Admin user type can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  -- Verificar user_type usando subquery directo
  auth.uid() IN (
    SELECT p.id 
    FROM profiles p 
    JOIN user_types ut ON p.user_type_id = ut.id 
    WHERE ut.is_admin = true
  )
);