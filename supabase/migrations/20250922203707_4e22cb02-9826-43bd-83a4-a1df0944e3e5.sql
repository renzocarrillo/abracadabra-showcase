-- Añadir política para que supervisores puedan ver usuarios no administradores
CREATE POLICY "Supervisors can view non-admin profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  user_has_permission('manage_users'::text) 
  AND NOT is_target_user_admin(id) 
  AND deleted_at IS NULL
);