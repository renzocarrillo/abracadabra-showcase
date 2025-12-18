-- Enable RLS on productos table if not already enabled
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;

-- Create policy to allow viewing products for users with view_products permission
CREATE POLICY "Users with view_products permission can read products" ON public.productos
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
);

-- Create policy for admins to manage products
CREATE POLICY "Admins can manage all products" ON public.productos
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid()
    AND ut.is_admin = true
  )
  OR
  -- Fallback for old role system
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() 
    AND p.role = 'admin'
  )
);

-- Create policy for users with manage_inventory permission to manage products
CREATE POLICY "Users with manage_inventory can manage products" ON public.productos
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    JOIN user_type_permissions utp ON ut.id = utp.user_type_id
    JOIN permissions perm ON utp.permission_id = perm.id
    WHERE p.id = auth.uid()
    AND perm.name = 'manage_inventory'
  )
);