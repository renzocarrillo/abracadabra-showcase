
-- Drop the restrictive INSERT policy on ventas_asignaciones
DROP POLICY IF EXISTS "Admin can manage sales assignments" ON ventas_asignaciones;

-- Create comprehensive policies for ventas_asignaciones
-- Allow INSERT for authorized users (supervisors, pickers, legacy vendedoras, admins)
CREATE POLICY "Authorized users can create sales assignments"
ON ventas_asignaciones
FOR INSERT
WITH CHECK (
  user_has_role('admin') OR
  user_has_role('vendedora') OR
  user_has_permission('create_sales') OR
  user_has_permission('edit_sales') OR
  EXISTS (
    SELECT 1 
    FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid()
      AND ut.name IN ('supervisor', 'picker', 'admin')
  )
);

-- Allow UPDATE for authorized users
CREATE POLICY "Authorized users can update sales assignments"
ON ventas_asignaciones
FOR UPDATE
USING (
  user_has_role('admin') OR
  user_has_role('vendedora') OR
  user_has_permission('edit_sales') OR
  EXISTS (
    SELECT 1 
    FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid()
      AND ut.name IN ('supervisor', 'picker', 'admin')
  )
);

-- Allow DELETE for admins only
CREATE POLICY "Admins can delete sales assignments"
ON ventas_asignaciones
FOR DELETE
USING (user_has_role('admin'));

-- Keep the existing SELECT policy as is (already allows supervisors and pickers)
