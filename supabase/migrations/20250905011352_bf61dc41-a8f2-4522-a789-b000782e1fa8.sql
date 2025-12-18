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