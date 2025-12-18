-- Arreglar las políticas RLS para que los administradores puedan ver todos los usuarios
-- Primero eliminar la política restrictiva existente y crear una más completa

DROP POLICY IF EXISTS "Admins can view all profiles including deleted" ON public.profiles;

CREATE POLICY "Admins and supervisors can view all profiles including deleted"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  -- Admins pueden ver todo
  user_has_role('admin'::text) 
  OR 
  -- Usuarios con user_type admin pueden ver todo
  (EXISTS (
    SELECT 1 FROM profiles p 
    JOIN user_types ut ON p.user_type_id = ut.id 
    WHERE p.id = auth.uid() AND ut.is_admin = true
  ))
  OR
  -- Supervisores pueden ver usuarios no admin
  (user_has_permission('manage_users'::text) AND NOT is_target_user_admin(id) AND deleted_at IS NULL)
  OR
  -- Usuarios pueden ver su propio perfil
  (auth.uid() = id AND deleted_at IS NULL)
);