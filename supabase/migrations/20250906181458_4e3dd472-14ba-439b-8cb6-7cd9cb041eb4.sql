-- Crear políticas RLS para las tablas que faltan

-- Políticas para productosBsale
CREATE POLICY "Usuarios autenticados pueden leer productosBsale"
ON public.productosBsale FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuarios autenticados pueden insertar productosBsale"
ON public.productosBsale FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar productosBsale"
ON public.productosBsale FOR UPDATE
TO authenticated
USING (true);

-- Políticas para stocks_tiendas_bsale
CREATE POLICY "Usuarios autenticados pueden leer stocks_tiendas_bsale"
ON public.stocks_tiendas_bsale FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuarios autenticados pueden insertar stocks_tiendas_bsale"
ON public.stocks_tiendas_bsale FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar stocks_tiendas_bsale"
ON public.stocks_tiendas_bsale FOR UPDATE
TO authenticated
USING (true);

-- Políticas para traslados_internos_sussy  
CREATE POLICY "Usuarios autenticados pueden leer traslados_internos_sussy"
ON public.traslados_internos_sussy FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuarios autenticados pueden insertar traslados_internos_sussy"
ON public.traslados_internos_sussy FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar traslados_internos_sussy"
ON public.traslados_internos_sussy FOR UPDATE
TO authenticated
USING (true);