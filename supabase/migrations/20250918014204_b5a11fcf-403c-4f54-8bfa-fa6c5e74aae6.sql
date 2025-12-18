-- Crear tabla de auditoría para ventas
CREATE TABLE IF NOT EXISTS public.ventas_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venta_id UUID NOT NULL,
  venta_codigo TEXT NOT NULL,
  accion TEXT NOT NULL, -- 'completado', 'cancelado', 'modificado', 'documento_emitido', 'guia_emitida'
  estado_anterior TEXT,
  estado_nuevo TEXT,
  usuario_id UUID REFERENCES auth.users(id),
  usuario_nombre TEXT,
  detalles JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.ventas_audit_log ENABLE ROW LEVEL SECURITY;

-- Crear políticas RLS
CREATE POLICY "Authorized users can read ventas audit logs" 
ON public.ventas_audit_log 
FOR SELECT 
USING (user_has_role('admin'::text) OR user_has_role('vendedora'::text));

CREATE POLICY "System can insert ventas audit logs" 
ON public.ventas_audit_log 
FOR INSERT 
WITH CHECK (true);

-- Crear función para registrar cambios de estado en ventas
CREATE OR REPLACE FUNCTION public.log_venta_state_change(
  p_venta_id UUID,
  p_venta_codigo TEXT,
  p_accion TEXT,
  p_estado_anterior TEXT DEFAULT NULL,
  p_estado_nuevo TEXT DEFAULT NULL,
  p_usuario_id UUID DEFAULT NULL,
  p_usuario_nombre TEXT DEFAULT NULL,
  p_detalles JSONB DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.ventas_audit_log (
    venta_id,
    venta_codigo,
    accion,
    estado_anterior,
    estado_nuevo,
    usuario_id,
    usuario_nombre,
    detalles
  ) VALUES (
    p_venta_id,
    p_venta_codigo,
    p_accion,
    p_estado_anterior,
    p_estado_nuevo,
    p_usuario_id,
    p_usuario_nombre,
    p_detalles
  );
  
  RETURN TRUE;
END;
$$;