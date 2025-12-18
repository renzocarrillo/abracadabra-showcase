-- Create table for stock receptions tracking
CREATE TABLE public.stock_receptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_number integer NOT NULL,
  document_type text NOT NULL DEFAULT 'Traslado interno',
  office_id integer NOT NULL DEFAULT 17,
  note text,
  total_items integer NOT NULL DEFAULT 0,
  bsale_response jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.stock_receptions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow read access to stock_receptions" 
ON public.stock_receptions 
FOR SELECT 
USING (true);

CREATE POLICY "Allow insert stock_receptions" 
ON public.stock_receptions 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow update stock_receptions" 
ON public.stock_receptions 
FOR UPDATE 
USING (true);

-- Create function to get next document number
CREATE OR REPLACE FUNCTION public.get_next_document_number()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    next_number integer;
BEGIN
    SELECT COALESCE(MAX(document_number), 0) + 1
    INTO next_number
    FROM stock_receptions;
    
    RETURN next_number;
END;
$$;

-- Create trigger for updated_at
CREATE TRIGGER update_stock_receptions_updated_at
BEFORE UPDATE ON public.stock_receptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();