-- ============================================
-- SECURITY FIX: Actualizar policies inseguras identificadas en auditoría
-- ============================================

-- 1. CRÍTICO: traslados_internos - Actualmente "Usuarios autenticados" pueden hacer TODO
DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar traslados_internos" ON public.traslados_internos;
DROP POLICY IF EXISTS "Usuarios autenticados pueden insertar traslados_internos" ON public.traslados_internos;

CREATE POLICY "Users with manage_transfers can manage transfers"
ON public.traslados_internos
FOR ALL
TO authenticated
USING (
  user_has_permission('manage_transfers'::text) OR
  user_has_permission('create_internal_transfer'::text) OR
  user_has_permission('create_external_transfer'::text) OR
  user_has_role('admin'::text) OR
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid() AND (ut.is_admin = true OR ut.name = 'supervisor')
  )
)
WITH CHECK (
  user_has_permission('manage_transfers'::text) OR
  user_has_permission('create_internal_transfer'::text) OR
  user_has_permission('create_external_transfer'::text) OR
  user_has_role('admin'::text) OR
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid() AND (ut.is_admin = true OR ut.name = 'supervisor')
  )
);

-- 2. CRÍTICO: traslados_internos_detalle - Actualmente "Usuarios autenticados" pueden hacer TODO
DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar traslados_internos_deta" ON public.traslados_internos_detalle;
DROP POLICY IF EXISTS "Usuarios autenticados pueden insertar traslados_internos_detall" ON public.traslados_internos_detalle;
DROP POLICY IF EXISTS "Usuarios autenticados pueden leer traslados_internos_detalle" ON public.traslados_internos_detalle;

CREATE POLICY "Users with transfer permissions can read transfer details"
ON public.traslados_internos_detalle
FOR SELECT
TO authenticated
USING (
  user_has_permission('manage_transfers'::text) OR
  user_has_permission('view_transfers'::text) OR
  user_has_permission('view_transfers_details'::text) OR
  user_has_role('admin'::text) OR
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid() AND (ut.is_admin = true OR ut.name = 'supervisor' OR ut.name != 'cabeza_de_tienda')
  )
);

CREATE POLICY "Users with manage_transfers can manage transfer details"
ON public.traslados_internos_detalle
FOR ALL
TO authenticated
USING (
  user_has_permission('manage_transfers'::text) OR
  user_has_permission('create_internal_transfer'::text) OR
  user_has_permission('create_external_transfer'::text) OR
  user_has_role('admin'::text) OR
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid() AND (ut.is_admin = true OR ut.name = 'supervisor')
  )
)
WITH CHECK (
  user_has_permission('manage_transfers'::text) OR
  user_has_permission('create_internal_transfer'::text) OR
  user_has_permission('create_external_transfer'::text) OR
  user_has_role('admin'::text) OR
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid() AND (ut.is_admin = true OR ut.name = 'supervisor')
  )
);

-- 3. MEJORA: tiendas - Agregar permission-based en lugar de solo "Only admins"
DROP POLICY IF EXISTS "Only admins can modify stores" ON public.tiendas;

CREATE POLICY "Authorized users can manage stores"
ON public.tiendas
FOR ALL
TO authenticated
USING (
  user_has_permission('manage_stores'::text) OR
  user_has_permission('manage_physical_stores'::text) OR
  user_has_permission('create_stores'::text) OR
  user_has_permission('edit_stores'::text) OR
  user_has_role('admin'::text) OR
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid() AND (ut.is_admin = true OR ut.name = 'supervisor')
  )
)
WITH CHECK (
  user_has_permission('manage_stores'::text) OR
  user_has_permission('manage_physical_stores'::text) OR
  user_has_permission('create_stores'::text) OR
  user_has_permission('edit_stores'::text) OR
  user_has_role('admin'::text) OR
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid() AND (ut.is_admin = true OR ut.name = 'supervisor')
  )
);

-- 4. MEJORA: variants - Mejorar policy "Admin can manage variants" para incluir permissions
DROP POLICY IF EXISTS "Admin can manage variants" ON public.variants;

CREATE POLICY "Authorized users can manage products"
ON public.variants
FOR ALL
TO authenticated
USING (
  user_has_permission('manage_products'::text) OR
  user_has_permission('create_products'::text) OR
  user_has_permission('edit_products'::text) OR
  user_has_role('admin'::text) OR
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid() AND (ut.is_admin = true OR ut.name = 'supervisor')
  )
)
WITH CHECK (
  user_has_permission('manage_products'::text) OR
  user_has_permission('create_products'::text) OR
  user_has_permission('edit_products'::text) OR
  user_has_role('admin'::text) OR
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid() AND (ut.is_admin = true OR ut.name = 'supervisor')
  )
);

-- 5. MEJORA: Agregar permission-based policies adicionales a pedidos
CREATE POLICY "Users with order permissions can view orders"
ON public.pedidos
FOR SELECT
TO authenticated
USING (
  user_has_role('admin'::text) OR
  user_has_role('vendedora'::text) OR
  user_has_permission('view_orders'::text) OR
  user_has_permission('view_orders_all'::text) OR
  user_has_permission('view_orders_details'::text) OR
  user_has_permission('manage_orders'::text) OR
  user_has_permission('picking_orders'::text) OR
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid() AND ut.name != 'cabeza_de_tienda'
  )
);

CREATE POLICY "Users with order permissions can manage orders"
ON public.pedidos
FOR INSERT
TO authenticated
WITH CHECK (
  user_has_role('admin'::text) OR
  user_has_role('vendedora'::text) OR
  user_has_permission('create_orders'::text) OR
  user_has_permission('manage_orders'::text)
);

CREATE POLICY "Users with order permissions can modify orders"
ON public.pedidos
FOR UPDATE
TO authenticated
USING (
  user_has_role('admin'::text) OR
  user_has_role('vendedora'::text) OR
  user_has_permission('edit_orders'::text) OR
  user_has_permission('manage_orders'::text)
);

CREATE POLICY "Users with order permissions can remove orders"
ON public.pedidos
FOR DELETE
TO authenticated
USING (
  user_has_role('admin'::text) OR
  user_has_permission('delete_orders'::text) OR
  user_has_permission('manage_orders'::text)
);

-- 6. MEJORA: pedidos_detalle - Agregar permission-based adicionales
CREATE POLICY "Users with permissions can view order details"
ON public.pedidos_detalle
FOR SELECT
TO authenticated
USING (
  user_has_role('admin'::text) OR
  user_has_role('vendedora'::text) OR
  user_has_permission('view_orders'::text) OR
  user_has_permission('view_orders_details'::text) OR
  user_has_permission('manage_orders'::text) OR
  user_has_permission('picking_orders'::text) OR
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid() AND ut.name != 'cabeza_de_tienda'
  )
);

CREATE POLICY "Users with permissions can modify order details"
ON public.pedidos_detalle
FOR ALL
TO authenticated
USING (
  user_has_role('admin'::text) OR
  user_has_role('vendedora'::text) OR
  user_has_permission('create_orders'::text) OR
  user_has_permission('edit_orders'::text) OR
  user_has_permission('manage_orders'::text)
)
WITH CHECK (
  user_has_role('admin'::text) OR
  user_has_role('vendedora'::text) OR
  user_has_permission('create_orders'::text) OR
  user_has_permission('edit_orders'::text) OR
  user_has_permission('manage_orders'::text)
);

-- 7. MEJORA: pedidos_asignaciones - Agregar permission-based
CREATE POLICY "Users with permissions can view assignments"
ON public.pedidos_asignaciones
FOR SELECT
TO authenticated
USING (
  user_has_role('admin'::text) OR
  user_has_permission('view_orders'::text) OR
  user_has_permission('view_orders_details'::text) OR
  user_has_permission('picking_orders'::text) OR
  user_has_permission('manage_orders'::text) OR
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid() AND ut.name != 'cabeza_de_tienda'
  )
);

CREATE POLICY "Users with permissions can modify assignments"
ON public.pedidos_asignaciones
FOR ALL
TO authenticated
USING (
  user_has_role('admin'::text) OR
  user_has_permission('picking_orders'::text) OR
  user_has_permission('manage_orders'::text)
)
WITH CHECK (
  user_has_role('admin'::text) OR
  user_has_permission('picking_orders'::text) OR
  user_has_permission('manage_orders'::text)
);

-- Comentarios para auditoría
COMMENT ON TABLE public.traslados_internos IS 'RLS actualizado: Requiere manage_transfers o create_transfer permissions';
COMMENT ON TABLE public.traslados_internos_detalle IS 'RLS actualizado: Requiere manage_transfers permissions';
COMMENT ON TABLE public.tiendas IS 'RLS actualizado: Permission-based para gestionar tiendas';
COMMENT ON TABLE public.variants IS 'RLS actualizado: Permission-based para gestionar productos';
COMMENT ON TABLE public.pedidos IS 'RLS mejorado: Agregadas policies permission-based adicionales';
COMMENT ON TABLE public.pedidos_detalle IS 'RLS mejorado: Agregadas policies permission-based';
COMMENT ON TABLE public.pedidos_asignaciones IS 'RLS mejorado: Agregadas policies permission-based';