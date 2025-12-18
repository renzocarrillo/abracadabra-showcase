-- Create pedidos table to store order information
CREATE TABLE public.pedidos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('Tienda', 'Web')),
  pedido TEXT NOT NULL UNIQUE,
  tienda TEXT NOT NULL,
  cantidad INTEGER NOT NULL,
  fecha_creacion TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

-- Create policy to allow reading pedidos data
CREATE POLICY "Allow read access to pedidos" 
ON public.pedidos 
FOR SELECT 
USING (true);

-- Create policy to allow inserting pedidos data
CREATE POLICY "Allow insert pedidos" 
ON public.pedidos 
FOR INSERT 
WITH CHECK (true);

-- Create policy to allow updating pedidos data
CREATE POLICY "Allow update pedidos" 
ON public.pedidos 
FOR UPDATE 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_pedidos_updated_at
BEFORE UPDATE ON public.pedidos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert the existing data from the orders page
INSERT INTO public.pedidos (tipo, pedido, tienda, cantidad, fecha_creacion) VALUES
('Tienda', 'T#1258', 'Tarpuy 1', 86, now() - INTERVAL '8 hours'),
('Tienda', 'T#1259', 'Tarpuy 2', 86, now() - INTERVAL '2 hours'),
('Tienda', 'T#1260', 'Ancash', 36, now() - INTERVAL '1 hour'),
('Web', 'W#2223', 'Web', 2, now() - INTERVAL '15 minutes'),
('Web', 'W#2225', 'Web', 5, now() - INTERVAL '7 minutes');