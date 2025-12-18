-- Update the variants table RLS policy to include users with view_products permission
DROP POLICY IF EXISTS "Authenticated users can read variants" ON public.variants;

-- Create new policy that allows users with view_products permission or admins to read variants
CREATE POLICY "Users with view_products permission can read variants" ON public.variants
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    JOIN user_type_permissions utp ON ut.id = utp.user_type_id
    JOIN permissions perm ON utp.permission_id = perm.id
    WHERE p.id = auth.uid()
    AND (perm.name = 'view_products' OR ut.is_admin = true)
  )
  OR
  -- Fallback for old role system
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() 
    AND p.role = 'admin'
  )
  OR
  -- Also allow authenticated users for now (more permissive)
  auth.role() = 'authenticated'
);