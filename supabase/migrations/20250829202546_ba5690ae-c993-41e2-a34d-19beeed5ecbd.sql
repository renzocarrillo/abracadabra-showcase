-- Create pedidos_detalle table as child of pedidos
CREATE TABLE public.pedidos_detalle (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id UUID REFERENCES public.pedidos(id) ON DELETE CASCADE,
  pedido TEXT NOT NULL, -- Identificador como T#1258, W#2223, etc.
  nombre_producto TEXT NOT NULL,
  variante TEXT,
  sku TEXT,
  preparacion TEXT,
  tienda TEXT NOT NULL,
  cantidad INTEGER NOT NULL DEFAULT 0,
  bin TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.pedidos_detalle ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow read access to pedidos_detalle" 
ON public.pedidos_detalle 
FOR SELECT 
USING (true);

CREATE POLICY "Allow insert pedidos_detalle" 
ON public.pedidos_detalle 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow update pedidos_detalle" 
ON public.pedidos_detalle 
FOR UPDATE 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_pedidos_detalle_updated_at
BEFORE UPDATE ON public.pedidos_detalle
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better performance on pedido_id lookups
CREATE INDEX idx_pedidos_detalle_pedido_id ON public.pedidos_detalle(pedido_id);

-- Create index for pedido identifier lookups
CREATE INDEX idx_pedidos_detalle_pedido ON public.pedidos_detalle(pedido);