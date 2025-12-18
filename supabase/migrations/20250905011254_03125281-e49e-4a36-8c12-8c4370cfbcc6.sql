-- Create internal transfers table
CREATE TABLE public.traslados_internos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_number INTEGER NOT NULL,
  emission_date INTEGER NOT NULL,
  office_id INTEGER NOT NULL DEFAULT 17,
  destination_office_id TEXT NOT NULL,
  recipient TEXT NOT NULL DEFAULT 'Innovación Textil',
  district TEXT NOT NULL DEFAULT 'Lima',
  city TEXT NOT NULL DEFAULT 'Lima',
  address TEXT NOT NULL DEFAULT 'Prol. Lucanas 1043',
  total_items INTEGER NOT NULL DEFAULT 0,
  bsale_response JSONB,
  pedido_id UUID REFERENCES public.pedidos(id),
  tienda_id UUID REFERENCES public.tiendas(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create traslados_internos_detalle table
CREATE TABLE public.traslados_internos_detalle (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  traslado_id UUID NOT NULL REFERENCES public.traslados_internos(id),
  sku TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  net_unit_value NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.traslados_internos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traslados_internos_detalle ENABLE ROW LEVEL SECURITY;

-- Create policies for traslados_internos
CREATE POLICY "Allow read access to traslados_internos" 
ON public.traslados_internos 
FOR SELECT 
USING (true);

CREATE POLICY "Allow insert traslados_internos" 
ON public.traslados_internos 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow update traslados_internos" 
ON public.traslados_internos 
FOR UPDATE 
USING (true);

-- Create policies for traslados_internos_detalle
CREATE POLICY "Allow read access to traslados_internos_detalle" 
ON public.traslados_internos_detalle 
FOR SELECT 
USING (true);

CREATE POLICY "Allow insert traslados_internos_detalle" 
ON public.traslados_internos_detalle 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow update traslados_internos_detalle" 
ON public.traslados_internos_detalle 
FOR UPDATE 
USING (true);

-- Create function to get next transfer document number
CREATE OR REPLACE FUNCTION public.get_next_transfer_number()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
    next_number integer;
BEGIN
    SELECT COALESCE(MAX(document_number), 0) + 1
    INTO next_number
    FROM traslados_internos;
    
    RETURN next_number;
END;
$function$

-- Add trigger for updating timestamps
CREATE TRIGGER update_traslados_internos_updated_at
  BEFORE UPDATE ON public.traslados_internos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_traslados_internos_detalle_updated_at
  BEFORE UPDATE ON public.traslados_internos_detalle
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();