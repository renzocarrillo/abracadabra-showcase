-- Simplificar aún más para evitar cualquier recursión
DROP POLICY IF EXISTS "Users with admin user type can view all profiles" ON public.profiles;

-- Política más simple usando solo la función security definer
CREATE POLICY "Admin user types can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  user_has_role('admin'::text) OR
  EXISTS (
    SELECT 1 FROM user_types ut
    JOIN profiles p ON p.user_type_id = ut.id
    WHERE p.id = auth.uid() AND ut.is_admin = true
  )
);