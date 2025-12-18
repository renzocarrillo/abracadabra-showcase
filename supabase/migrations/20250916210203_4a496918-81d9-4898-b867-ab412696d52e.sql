-- Ensure RLS and policy for sellers so authenticated users can read
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios autenticados pueden leer sellers" ON public.sellers;
CREATE POLICY "Usuarios autenticados pueden leer sellers"
ON public.sellers
FOR SELECT
TO authenticated
USING (true);