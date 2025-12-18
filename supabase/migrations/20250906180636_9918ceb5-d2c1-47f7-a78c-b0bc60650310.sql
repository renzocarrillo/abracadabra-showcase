-- Completar políticas RLS para las tablas restantes

-- Pedidos asignaciones
DROP POLICY IF EXISTS "Allow read access to pedidos_asignaciones" ON public.pedidos_asignaciones;
DROP POLICY IF EXISTS "Allow insert pedidos_asignaciones" ON public.pedidos_asignaciones;
DROP POLICY IF EXISTS "Allow update pedidos_asignaciones" ON public.pedidos_asignaciones;

CREATE POLICY "Usuarios autenticados pueden leer pedidos_asignaciones"
ON public.pedidos_asignaciones FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuarios autenticados pueden insertar pedidos_asignaciones"
ON public.pedidos_asignaciones FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar pedidos_asignaciones"
ON public.pedidos_asignaciones FOR UPDATE
TO authenticated
USING (true);

-- Pickers
DROP POLICY IF EXISTS "Allow read access to pickers" ON public.pickers;
DROP POLICY IF EXISTS "Allow insert pickers" ON public.pickers;
DROP POLICY IF EXISTS "Allow update pickers" ON public.pickers;

CREATE POLICY "Usuarios autenticados pueden leer pickers"
ON public.pickers FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuarios autenticados pueden insertar pickers"
ON public.pickers FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar pickers"
ON public.pickers FOR UPDATE
TO authenticated
USING (true);

-- Stock totals
DROP POLICY IF EXISTS "Allow read access to stock_totals" ON public.stock_totals;
DROP POLICY IF EXISTS "Allow insert stock_totals" ON public.stock_totals;
DROP POLICY IF EXISTS "Allow update stock_totals" ON public.stock_totals;

CREATE POLICY "Usuarios autenticados pueden leer stock_totals"
ON public.stock_totals FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuarios autenticados pueden insertar stock_totals"
ON public.stock_totals FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar stock_totals"
ON public.stock_totals FOR UPDATE
TO authenticated
USING (true);

-- Stock receptions
DROP POLICY IF EXISTS "Allow read access to stock_receptions" ON public.stock_receptions;
DROP POLICY IF EXISTS "Allow insert stock_receptions" ON public.stock_receptions;
DROP POLICY IF EXISTS "Allow update stock_receptions" ON public.stock_receptions;

CREATE POLICY "Usuarios autenticados pueden leer stock_receptions"
ON public.stock_receptions FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuarios autenticados pueden insertar stock_receptions"
ON public.stock_receptions FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar stock_receptions"
ON public.stock_receptions FOR UPDATE
TO authenticated
USING (true);

-- Stock consumptions
DROP POLICY IF EXISTS "Allow read access to stock_consumptions" ON public.stock_consumptions;
DROP POLICY IF EXISTS "Allow insert stock_consumptions" ON public.stock_consumptions;
DROP POLICY IF EXISTS "Allow update stock_consumptions" ON public.stock_consumptions;

CREATE POLICY "Usuarios autenticados pueden leer stock_consumptions"
ON public.stock_consumptions FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuarios autenticados pueden insertar stock_consumptions"
ON public.stock_consumptions FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar stock_consumptions"
ON public.stock_consumptions FOR UPDATE
TO authenticated
USING (true);

-- Traslados internos
DROP POLICY IF EXISTS "Allow read access to traslados_internos" ON public.traslados_internos;
DROP POLICY IF EXISTS "Allow insert traslados_internos" ON public.traslados_internos;
DROP POLICY IF EXISTS "Allow update traslados_internos" ON public.traslados_internos;

CREATE POLICY "Usuarios autenticados pueden leer traslados_internos"
ON public.traslados_internos FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuarios autenticados pueden insertar traslados_internos"
ON public.traslados_internos FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar traslados_internos"
ON public.traslados_internos FOR UPDATE
TO authenticated
USING (true);

-- Traslados internos detalle
DROP POLICY IF EXISTS "Allow read access to traslados_internos_detalle" ON public.traslados_internos_detalle;
DROP POLICY IF EXISTS "Allow insert traslados_internos_detalle" ON public.traslados_internos_detalle;
DROP POLICY IF EXISTS "Allow update traslados_internos_detalle" ON public.traslados_internos_detalle;

CREATE POLICY "Usuarios autenticados pueden leer traslados_internos_detalle"
ON public.traslados_internos_detalle FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuarios autenticados pueden insertar traslados_internos_detalle"
ON public.traslados_internos_detalle FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar traslados_internos_detalle"
ON public.traslados_internos_detalle FOR UPDATE
TO authenticated
USING (true);