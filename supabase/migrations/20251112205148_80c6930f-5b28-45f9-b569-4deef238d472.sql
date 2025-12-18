-- Create stock_reception_details table
CREATE TABLE IF NOT EXISTS public.stock_reception_details (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reception_id UUID NOT NULL REFERENCES public.stock_receptions(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  nombre_producto TEXT NOT NULL,
  variante TEXT,
  bin_code TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(10, 2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create stock_consumption_details table
CREATE TABLE IF NOT EXISTS public.stock_consumption_details (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  consumption_id UUID NOT NULL REFERENCES public.stock_consumptions(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  nombre_producto TEXT NOT NULL,
  variante TEXT,
  bin_code TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_stock_reception_details_reception_id 
  ON public.stock_reception_details(reception_id);

CREATE INDEX IF NOT EXISTS idx_stock_reception_details_sku 
  ON public.stock_reception_details(sku);

CREATE INDEX IF NOT EXISTS idx_stock_consumption_details_consumption_id 
  ON public.stock_consumption_details(consumption_id);

CREATE INDEX IF NOT EXISTS idx_stock_consumption_details_sku 
  ON public.stock_consumption_details(sku);

-- Enable RLS on both tables
ALTER TABLE public.stock_reception_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_consumption_details ENABLE ROW LEVEL SECURITY;

-- RLS Policies for stock_reception_details
-- Admins and supervisors can read
CREATE POLICY "Admins and supervisors can read reception details"
  ON public.stock_reception_details
  FOR SELECT
  USING (
    user_has_role('admin'::text) OR
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN user_types ut ON p.user_type_id = ut.id
      WHERE p.id = auth.uid() AND ut.name = 'supervisor'
    )
  );

-- System/authenticated users can insert (for edge functions)
CREATE POLICY "System can insert reception details"
  ON public.stock_reception_details
  FOR INSERT
  WITH CHECK (true);

-- RLS Policies for stock_consumption_details
-- Admins and supervisors can read
CREATE POLICY "Admins and supervisors can read consumption details"
  ON public.stock_consumption_details
  FOR SELECT
  USING (
    user_has_role('admin'::text) OR
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN user_types ut ON p.user_type_id = ut.id
      WHERE p.id = auth.uid() AND ut.name = 'supervisor'
    )
  );

-- System/authenticated users can insert (for edge functions)
CREATE POLICY "System can insert consumption details"
  ON public.stock_consumption_details
  FOR INSERT
  WITH CHECK (true);

-- Add helpful comments
COMMENT ON TABLE public.stock_reception_details IS 'Detalle de productos en cada recepción de stock';
COMMENT ON TABLE public.stock_consumption_details IS 'Detalle de productos en cada consumo/retiro de stock';

COMMENT ON COLUMN public.stock_reception_details.reception_id IS 'ID de la recepción de stock';
COMMENT ON COLUMN public.stock_reception_details.sku IS 'SKU del producto';
COMMENT ON COLUMN public.stock_reception_details.nombre_producto IS 'Nombre del producto';
COMMENT ON COLUMN public.stock_reception_details.variante IS 'Variante del producto';
COMMENT ON COLUMN public.stock_reception_details.bin_code IS 'Código del bin donde se ingresó';
COMMENT ON COLUMN public.stock_reception_details.quantity IS 'Cantidad ingresada';
COMMENT ON COLUMN public.stock_reception_details.unit_cost IS 'Costo unitario del producto';

COMMENT ON COLUMN public.stock_consumption_details.consumption_id IS 'ID del consumo de stock';
COMMENT ON COLUMN public.stock_consumption_details.sku IS 'SKU del producto';
COMMENT ON COLUMN public.stock_consumption_details.nombre_producto IS 'Nombre del producto';
COMMENT ON COLUMN public.stock_consumption_details.variante IS 'Variante del producto';
COMMENT ON COLUMN public.stock_consumption_details.bin_code IS 'Código del bin desde donde se retiró';
COMMENT ON COLUMN public.stock_consumption_details.quantity IS 'Cantidad retirada';