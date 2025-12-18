-- Create bins table
CREATE TABLE public.bins (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    bin_code TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on bins table
ALTER TABLE public.bins ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for bins
CREATE POLICY "Allow read access to bins" 
ON public.bins 
FOR SELECT 
USING (true);

CREATE POLICY "Allow insert bins" 
ON public.bins 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow update bins" 
ON public.bins 
FOR UPDATE 
USING (true);

-- Insert initial bin data
INSERT INTO public.bins (bin_code) VALUES 
('AA-01-01'),
('AA-02-02'), 
('AA-03-03');

-- Create stockxbin table
CREATE TABLE public.stockxbin (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    sku TEXT,
    cantidad INTEGER,
    bin TEXT REFERENCES public.bins(bin_code),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on stockxbin table
ALTER TABLE public.stockxbin ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for stockxbin
CREATE POLICY "Allow read access to stockxbin" 
ON public.stockxbin 
FOR SELECT 
USING (true);

CREATE POLICY "Allow insert stockxbin" 
ON public.stockxbin 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow update stockxbin" 
ON public.stockxbin 
FOR UPDATE 
USING (true);

-- Add triggers for updated_at columns
CREATE TRIGGER update_bins_updated_at
BEFORE UPDATE ON public.bins
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_stockxbin_updated_at
BEFORE UPDATE ON public.stockxbin
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();