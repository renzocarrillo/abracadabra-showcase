-- Habilitar RLS si no está habilitado y agregar política de lectura
ALTER TABLE public.ubicaciones_temporales ENABLE ROW LEVEL SECURITY;

-- Política para permitir que usuarios autenticados lean la tabla
CREATE POLICY "Authenticated users can read ubicaciones_temporales"
ON public.ubicaciones_temporales
FOR SELECT
USING (true);