-- Actualizar las políticas RLS para la tabla bins para permitir lectura a usuarios autenticados
DROP POLICY IF EXISTS "Admin can manage bins" ON public.bins;

-- Política para que todos los usuarios autenticados puedan leer bins
CREATE POLICY "Authenticated users can read bins" ON public.bins
FOR SELECT TO authenticated
USING (true);

-- Política para que admins y usuarios con permisos puedan gestionar bins  
CREATE POLICY "Authorized users can manage bins" ON public.bins
FOR ALL TO authenticated
USING (user_has_role('admin'::text) OR user_has_permission('manage_bins'::text))
WITH CHECK (user_has_role('admin'::text) OR user_has_permission('manage_bins'::text));