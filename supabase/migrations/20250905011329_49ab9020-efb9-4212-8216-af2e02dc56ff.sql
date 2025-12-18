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