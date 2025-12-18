-- Create tiendas table
CREATE TABLE public.tiendas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  officeId TEXT,
  pertenenceInnovacion BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.tiendas ENABLE ROW LEVEL SECURITY;

-- Create policies for tiendas
CREATE POLICY "Allow read access to tiendas" 
ON public.tiendas 
FOR SELECT 
USING (true);

CREATE POLICY "Allow insert tiendas" 
ON public.tiendas 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow update tiendas" 
ON public.tiendas 
FOR UPDATE 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_tiendas_updated_at
BEFORE UPDATE ON public.tiendas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();