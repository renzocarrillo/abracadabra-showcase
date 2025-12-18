-- Allow pickers and authorized users to view archived sales and related data

-- ventas: broaden SELECT access
create policy if not exists "Pickers and viewers can read sales"
on public.ventas
for select
to authenticated
using (
  public.user_has_role('admin')
  OR public.user_has_role('vendedora')
  OR public.user_has_permission('view_sales')
  OR public.user_has_permission('picking_operations')
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid() AND (ut.name = 'picker' OR ut.is_admin = true)
  )
);

-- ventas_detalle: broaden SELECT access
create policy if not exists "Pickers can read sales details"
on public.ventas_detalle
for select
to authenticated
using (
  public.user_has_role('admin')
  OR public.user_has_role('vendedora')
  OR public.user_has_permission('view_sales')
  OR public.user_has_permission('picking_operations')
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid() AND (ut.name = 'picker' OR ut.is_admin = true)
  )
);

-- ventas_asignaciones: add SELECT for pickers and ops
create policy if not exists "Authorized users can read sales assignments"
on public.ventas_asignaciones
for select
to authenticated
using (
  public.user_has_role('admin')
  OR public.user_has_permission('picking_operations')
  OR public.user_has_permission('view_sales')
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid() AND (ut.name = 'picker' OR ut.is_admin = true)
  )
);
