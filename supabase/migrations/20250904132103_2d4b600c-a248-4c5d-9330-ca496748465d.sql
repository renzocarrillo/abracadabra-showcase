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
$function$;