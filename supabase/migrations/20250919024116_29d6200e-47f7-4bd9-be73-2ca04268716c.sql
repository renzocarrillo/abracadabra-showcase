-- Broaden read access so pickers and authorized users can view sales and guides

-- ventas: SELECT for pickers and viewers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'ventas' AND policyname = 'Pickers and viewers can read sales'
  ) THEN
    CREATE POLICY "Pickers and viewers can read sales"
    ON public.ventas
    FOR SELECT TO authenticated
    USING (
      public.user_has_role('admin')
      OR public.user_has_role('vendedora')
      OR public.user_has_permission('view_sales')
      OR public.user_has_permission('picking_operations')
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.user_types ut ON p.user_type_id = ut.id
        WHERE p.id = auth.uid() AND (ut.name = 'picker' OR ut.is_admin = true)
      )
    );
  END IF;
END$$;

-- ventas_detalle: SELECT for pickers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'ventas_detalle' AND policyname = 'Pickers can read sales details'
  ) THEN
    CREATE POLICY "Pickers can read sales details"
    ON public.ventas_detalle
    FOR SELECT TO authenticated
    USING (
      public.user_has_role('admin')
      OR public.user_has_role('vendedora')
      OR public.user_has_permission('view_sales')
      OR public.user_has_permission('picking_operations')
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.user_types ut ON p.user_type_id = ut.id
        WHERE p.id = auth.uid() AND (ut.name = 'picker' OR ut.is_admin = true)
      )
    );
  END IF;
END$$;

-- ventas_asignaciones: SELECT for pickers and ops
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'ventas_asignaciones' AND policyname = 'Authorized users can read sales assignments'
  ) THEN
    CREATE POLICY "Authorized users can read sales assignments"
    ON public.ventas_asignaciones
    FOR SELECT TO authenticated
    USING (
      public.user_has_role('admin')
      OR public.user_has_permission('picking_operations')
      OR public.user_has_permission('view_sales')
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.user_types ut ON p.user_type_id = ut.id
        WHERE p.id = auth.uid() AND (ut.name = 'picker' OR ut.is_admin = true)
      )
    );
  END IF;
END$$;
