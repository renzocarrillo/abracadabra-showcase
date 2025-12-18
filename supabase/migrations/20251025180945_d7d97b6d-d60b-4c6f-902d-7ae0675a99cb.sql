-- Create table for product counting sessions
CREATE TABLE public.conteo_productos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  created_by_name TEXT,
  total_productos INTEGER NOT NULL DEFAULT 0,
  total_unidades INTEGER NOT NULL DEFAULT 0,
  notas TEXT
);

-- Create table for product counting details
CREATE TABLE public.conteo_productos_detalle (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conteo_id UUID NOT NULL REFERENCES public.conteo_productos(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  cantidad INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.conteo_productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conteo_productos_detalle ENABLE ROW LEVEL SECURITY;

-- RLS Policies for conteo_productos
CREATE POLICY "Users can view their own counts"
ON public.conteo_productos
FOR SELECT
USING (auth.uid() = created_by);

CREATE POLICY "Users can create their own counts"
ON public.conteo_productos
FOR INSERT
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Admins can view all counts"
ON public.conteo_productos
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- RLS Policies for conteo_productos_detalle
CREATE POLICY "Users can view details of their counts"
ON public.conteo_productos_detalle
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM conteo_productos
    WHERE conteo_productos.id = conteo_productos_detalle.conteo_id
    AND conteo_productos.created_by = auth.uid()
  )
);

CREATE POLICY "Users can insert details for their counts"
ON public.conteo_productos_detalle
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM conteo_productos
    WHERE conteo_productos.id = conteo_productos_detalle.conteo_id
    AND conteo_productos.created_by = auth.uid()
  )
);

CREATE POLICY "Admins can view all count details"
ON public.conteo_productos_detalle
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Create indexes for better performance
CREATE INDEX idx_conteo_productos_created_by ON public.conteo_productos(created_by);
CREATE INDEX idx_conteo_productos_created_at ON public.conteo_productos(created_at DESC);
CREATE INDEX idx_conteo_productos_detalle_conteo_id ON public.conteo_productos_detalle(conteo_id);
CREATE INDEX idx_conteo_productos_detalle_sku ON public.conteo_productos_detalle(sku);