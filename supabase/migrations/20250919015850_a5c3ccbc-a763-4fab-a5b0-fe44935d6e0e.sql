-- Update RLS policy for pedidos_asignaciones to allow users with proper permissions to view order assignments
DROP POLICY IF EXISTS "Authorized users can read order assignments" ON public.pedidos_asignaciones;

CREATE POLICY "Authorized users can read order assignments" 
ON public.pedidos_asignaciones 
FOR SELECT 
TO authenticated 
USING (
  user_has_role('admin'::text) OR 
  user_has_role('vendedora'::text) OR 
  (EXISTS ( 
    SELECT 1
    FROM (profiles p JOIN user_types ut ON ((p.user_type_id = ut.id)))
    WHERE ((p.id = auth.uid()) AND ((ut.name = ANY (ARRAY['picker'::text, 'admin'::text])) OR (ut.is_admin = true)))
  )) OR 
  (EXISTS ( 
    SELECT 1
    FROM ((profiles p JOIN user_type_permissions utp ON ((p.user_type_id = utp.user_type_id))) JOIN permissions perm ON ((utp.permission_id = perm.id)))
    WHERE ((p.id = auth.uid()) AND (perm.name = ANY (ARRAY['view_orders'::text, 'view_bins'::text, 'manage_bins_all'::text, 'view_picking_details'::text])))
  ))
);

-- Also ensure pedidos_detalle is readable by pickers
DROP POLICY IF EXISTS "Authorized users can read order details" ON public.pedidos_detalle;

CREATE POLICY "Authorized users can read order details" 
ON public.pedidos_detalle 
FOR SELECT 
TO authenticated 
USING (
  user_has_role('admin'::text) OR 
  user_has_role('vendedora'::text) OR 
  (EXISTS ( 
    SELECT 1
    FROM (profiles p JOIN user_types ut ON ((p.user_type_id = ut.id)))
    WHERE ((p.id = auth.uid()) AND ((ut.name = ANY (ARRAY['picker'::text, 'admin'::text])) OR (ut.is_admin = true)))
  )) OR 
  (EXISTS ( 
    SELECT 1
    FROM ((profiles p JOIN user_type_permissions utp ON ((p.user_type_id = utp.user_type_id))) JOIN permissions perm ON ((utp.permission_id = perm.id)))
    WHERE ((p.id = auth.uid()) AND (perm.name = ANY (ARRAY['view_orders'::text, 'view_products'::text, 'view_picking_details'::text])))
  ))
);