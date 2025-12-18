-- Create table for stock consumptions/withdrawals
CREATE TABLE public.stock_consumptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_number INTEGER NOT NULL,
  office_id INTEGER NOT NULL DEFAULT 17,
  note TEXT,
  bsale_response JSONB,
  total_items INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.stock_consumptions ENABLE ROW LEVEL SECURITY;

-- Create policies for stock_consumptions
CREATE POLICY "Allow read access to stock_consumptions" 
ON public.stock_consumptions 
FOR SELECT 
USING (true);

CREATE POLICY "Allow insert stock_consumptions" 
ON public.stock_consumptions 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow update stock_consumptions" 
ON public.stock_consumptions 
FOR UPDATE 
USING (true);