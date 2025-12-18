-- Crear tabla de transportistas
CREATE TABLE public.transportistas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ruc text NOT NULL UNIQUE,
  nombre_empresa text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.transportistas ENABLE ROW LEVEL SECURITY;

-- Create policies for transportistas
CREATE POLICY "Usuarios autenticados pueden leer transportistas" 
ON public.transportistas 
FOR SELECT 
USING (true);

CREATE POLICY "Usuarios autenticados pueden insertar transportistas" 
ON public.transportistas 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar transportistas" 
ON public.transportistas 
FOR UPDATE 
USING (true);

-- Crear tabla de ubigeos
CREATE TABLE public.ubigeos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo text NOT NULL UNIQUE,
  departamento text NOT NULL,
  provincia text NOT NULL,
  distrito text NOT NULL,
  nombre_completo text NOT NULL, -- Campo calculado para búsqueda
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ubigeos ENABLE ROW LEVEL SECURITY;

-- Create policies for ubigeos
CREATE POLICY "Usuarios autenticados pueden leer ubigeos" 
ON public.ubigeos 
FOR SELECT 
USING (true);

CREATE POLICY "Usuarios autenticados pueden insertar ubigeos" 
ON public.ubigeos 
FOR INSERT 
WITH CHECK (true);

-- Create index for faster search
CREATE INDEX idx_ubigeos_nombre_completo ON public.ubigeos USING gin(to_tsvector('spanish', nombre_completo));
CREATE INDEX idx_ubigeos_codigo ON public.ubigeos (codigo);

-- Trigger para updated_at en transportistas
CREATE TRIGGER update_transportistas_updated_at
BEFORE UPDATE ON public.transportistas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger para updated_at en ubigeos
CREATE TRIGGER update_ubigeos_updated_at
BEFORE UPDATE ON public.ubigeos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insertar algunos ubigeos de ejemplo basados en la imagen
INSERT INTO public.ubigeos (codigo, departamento, provincia, distrito, nombre_completo) VALUES
('010101', 'AMAZONAS', 'CHACHAPOYAS', 'CHACHAPOYAS', 'CHACHAPOYAS, CHACHAPOYAS, AMAZONAS (010101)'),
('010102', 'AMAZONAS', 'CHACHAPOYAS', 'ASUNCION', 'ASUNCION, CHACHAPOYAS, AMAZONAS (010102)'),
('010103', 'AMAZONAS', 'CHACHAPOYAS', 'BALSAS', 'BALSAS, CHACHAPOYAS, AMAZONAS (010103)');