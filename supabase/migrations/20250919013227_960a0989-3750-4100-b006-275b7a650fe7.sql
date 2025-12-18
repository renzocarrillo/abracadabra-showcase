-- Allow non-admin authorized users (pickers and permitted roles) to read order assignments
-- so they can see the BIN during picking

-- Create a SELECT policy on pedidos_asignaciones for pickers and authorized users
CREATE POLICY "Authorized users can read order assignments"
ON public.pedidos_asignaciones
FOR SELECT
USING (
  -- Old role system
  user_has_role('admin'::text)
  OR user_has_role('vendedora'::text)
  -- New user types: allow pickers and admins
  OR (EXISTS (
    SELECT 1
    FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid() AND (ut.name = 'picker' OR ut.is_admin = true)
  ))
  -- Users with relevant permissions via the new permission system
  OR (EXISTS (
    SELECT 1
    FROM profiles p
    JOIN user_type_permissions utp ON p.user_type_id = utp.user_type_id
    JOIN permissions perm ON utp.permission_id = perm.id
    WHERE p.id = auth.uid() AND perm.name = ANY (ARRAY['view_orders','view_bins','manage_bins_all'])
  ))
);
