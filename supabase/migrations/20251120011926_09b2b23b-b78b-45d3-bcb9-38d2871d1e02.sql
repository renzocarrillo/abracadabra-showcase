-- ============================================
-- FASE 4: HABILITAR RLS EN picking_libre_emissions
-- ============================================

-- Habilitar RLS en la tabla de emisiones
ALTER TABLE public.picking_libre_emissions ENABLE ROW LEVEL SECURITY;

-- Política: Solo usuarios autenticados pueden ver emisiones
CREATE POLICY "Usuarios pueden ver emisiones"
ON public.picking_libre_emissions
FOR SELECT
TO authenticated
USING (true);

-- Política: Solo el sistema (service_role) puede insertar emisiones
-- Las inserciones se hacen desde edge functions con service_role
CREATE POLICY "Sistema puede insertar emisiones"
ON public.picking_libre_emissions
FOR INSERT
TO service_role
WITH CHECK (true);

-- Política: Solo el sistema puede actualizar emisiones
CREATE POLICY "Sistema puede actualizar emisiones"
ON public.picking_libre_emissions
FOR UPDATE
TO service_role
USING (true);

-- Comentario
COMMENT ON TABLE public.picking_libre_emissions IS 'Tabla con RLS habilitado - Solo lectura para usuarios, escritura para sistema';