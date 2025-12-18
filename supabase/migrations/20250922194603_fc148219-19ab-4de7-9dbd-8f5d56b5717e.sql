-- Allow all authenticated users to read stores (tiendas)
-- This replaces the restrictive policy that only allowed admins, supervisors, and managers

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Restricted store data access" ON public.tiendas;

-- Create a new policy that allows all authenticated users to read stores
CREATE POLICY "All authenticated users can read stores" 
ON public.tiendas 
FOR SELECT 
TO authenticated
USING (true);

-- Keep the admin-only policy for modifications (INSERT, UPDATE, DELETE)
-- This policy should already exist, but let's ensure it's properly defined
DROP POLICY IF EXISTS "Only admins can modify stores" ON public.tiendas;

CREATE POLICY "Only admins can modify stores" 
ON public.tiendas 
FOR ALL 
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = auth.uid() 
      AND p.deleted_at IS NULL 
      AND p.role = 'admin'::user_role
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = auth.uid() 
      AND p.deleted_at IS NULL 
      AND p.role = 'admin'::user_role
  )
);