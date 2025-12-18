-- Create table for frozen products (products that cannot be transferred between stores)
CREATE TABLE public.productos_congelados (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  nombre_producto TEXT NOT NULL,
  fecha_congelacion TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  congelado_por_usuario_id UUID REFERENCES auth.users(id),
  congelado_por_usuario_nombre TEXT,
  motivo TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.productos_congelados ENABLE ROW LEVEL SECURITY;

-- Create policies for frozen products
CREATE POLICY "Admin can manage frozen products" 
ON public.productos_congelados 
FOR ALL 
USING (user_has_permission('manage_frozen_products'));

CREATE POLICY "Authenticated users can read frozen products" 
ON public.productos_congelados 
FOR SELECT 
USING (auth.role() = 'authenticated');

-- Add new permissions for product freezing
INSERT INTO public.permissions (name, display_name, description, category) VALUES
('manage_frozen_products', 'Gestionar Productos Congelados', 'Permite congelar y liberar productos para traslados entre sucursales', 'inventory'),
('view_frozen_products', 'Ver Productos Congelados', 'Permite ver la lista de productos congelados', 'inventory');

-- Create function to check if a product is frozen for transfers
CREATE OR REPLACE FUNCTION public.is_product_frozen_for_transfer(product_sku text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.productos_congelados 
    WHERE sku = product_sku
  );
$$;

-- Create trigger for updated_at
CREATE TRIGGER update_productos_congelados_updated_at
BEFORE UPDATE ON public.productos_congelados
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();