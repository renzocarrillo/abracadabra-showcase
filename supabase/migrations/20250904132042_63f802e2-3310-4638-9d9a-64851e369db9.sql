-- Create function to get next consumption document number
CREATE OR REPLACE FUNCTION public.get_next_consumption_number()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    next_number integer;
BEGIN
    SELECT COALESCE(MAX(document_number), 0) + 1
    INTO next_number
    FROM stock_consumptions;
    
    RETURN next_number;
END;
$function$

-- Create trigger to update timestamps
CREATE TRIGGER update_stock_consumptions_updated_at
BEFORE UPDATE ON public.stock_consumptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();