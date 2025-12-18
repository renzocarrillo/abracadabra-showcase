-- Update the RLS policy to also support the old role system
DROP POLICY IF EXISTS "Admin can manage frozen products" ON public.productos_congelados;

CREATE POLICY "Admin can manage frozen products" 
ON public.productos_congelados 
FOR ALL 
USING (
  user_has_permission('manage_frozen_products') OR 
  get_current_user_role() = 'admin'
);

-- Also update the read policy to be more permissive
DROP POLICY IF EXISTS "Authenticated users can read frozen products" ON public.productos_congelados;

CREATE POLICY "Authenticated users can read frozen products" 
ON public.productos_congelados 
FOR SELECT 
USING (
  user_has_permission('view_frozen_products') OR 
  get_current_user_role() IN ('admin', 'vendedora')
);