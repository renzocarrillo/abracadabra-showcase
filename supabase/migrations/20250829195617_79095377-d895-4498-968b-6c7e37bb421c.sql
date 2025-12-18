-- Create pickers table to store picker information and daily processed products
CREATE TABLE public.pickers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  products_processed_today INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.pickers ENABLE ROW LEVEL SECURITY;

-- Create policy to allow reading pickers data (since this is operational data, we'll allow read access)
CREATE POLICY "Allow read access to pickers" 
ON public.pickers 
FOR SELECT 
USING (true);

-- Create policy to allow inserting pickers data
CREATE POLICY "Allow insert pickers" 
ON public.pickers 
FOR INSERT 
WITH CHECK (true);

-- Create policy to allow updating pickers data
CREATE POLICY "Allow update pickers" 
ON public.pickers 
FOR UPDATE 
USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_pickers_updated_at
BEFORE UPDATE ON public.pickers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert the existing data from the dashboard
INSERT INTO public.pickers (name, products_processed_today) VALUES
('Alejandro', 100),
('Renzo', 78),
('Juan', 75),
('Ruben', 34);