-- Create function to handle stockxbin record combination
CREATE OR REPLACE FUNCTION public.combine_stockxbin_records()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $function$
DECLARE
    existing_record RECORD;
BEGIN
    -- Check if a record with the same sku, idBsale, and bin already exists
    SELECT id, disponibles, comprometido
    INTO existing_record
    FROM stockxbin 
    WHERE sku = NEW.sku 
    AND "idBsale" = NEW."idBsale" 
    AND bin = NEW.bin
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    
    -- If an existing record is found, update it and prevent the insert
    IF existing_record.id IS NOT NULL THEN
        UPDATE stockxbin 
        SET 
            disponibles = COALESCE(existing_record.disponibles, 0) + COALESCE(NEW.disponibles, 0),
            comprometido = COALESCE(existing_record.comprometido, 0) + COALESCE(NEW.comprometido, 0),
            updated_at = now()
        WHERE id = existing_record.id;
        
        -- Return NULL to prevent the insert of the new record
        RETURN NULL;
    END IF;
    
    -- If no existing record found, allow the insert to proceed
    RETURN NEW;
END;
$function$;

-- Create trigger for stockxbin record combination
CREATE TRIGGER combine_stockxbin_records_trigger
    BEFORE INSERT ON stockxbin
    FOR EACH ROW
    EXECUTE FUNCTION public.combine_stockxbin_records();