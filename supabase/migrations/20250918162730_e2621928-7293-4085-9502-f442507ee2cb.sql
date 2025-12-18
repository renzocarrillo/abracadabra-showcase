-- Function to fix negative committed stock immediately
CREATE OR REPLACE FUNCTION public.fix_negative_committed_stock()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    negative_stock_record RECORD;
    fixes_applied INTEGER := 0;
    fix_report jsonb := '{}';
BEGIN
    -- Fix all negative committed stock
    FOR negative_stock_record IN 
        SELECT id, sku, bin, disponibles, comprometido, en_existencia
        FROM stockxbin 
        WHERE comprometido < 0
    LOOP
        -- Move the negative amount from committed back to available
        UPDATE stockxbin 
        SET 
            disponibles = disponibles + ABS(comprometido),
            comprometido = 0,
            updated_at = now()
        WHERE id = negative_stock_record.id;
        
        fixes_applied := fixes_applied + 1;
        
        RAISE NOTICE 'Fixed negative committed stock for SKU % in bin %: moved % units back to available', 
                     negative_stock_record.sku,
                     negative_stock_record.bin,
                     ABS(negative_stock_record.comprometido);
    END LOOP;
    
    fix_report := jsonb_build_object(
        'negative_fixes_applied', fixes_applied,
        'fix_timestamp', now()
    );
    
    RETURN fix_report;
END;
$function$;

-- Add constraint to prevent negative committed stock in the future
ALTER TABLE stockxbin 
ADD CONSTRAINT check_committed_not_negative 
CHECK (comprometido >= 0);

-- Add constraint to prevent negative disponibles
ALTER TABLE stockxbin 
ADD CONSTRAINT check_disponibles_not_negative 
CHECK (disponibles >= 0);

-- Trigger to recalculate en_existencia and prevent negative values
CREATE OR REPLACE FUNCTION public.validate_stock_values()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- Ensure no negative values
    NEW.disponibles := GREATEST(0, COALESCE(NEW.disponibles, 0));
    NEW.comprometido := GREATEST(0, COALESCE(NEW.comprometido, 0));
    
    -- Recalculate en_existencia
    NEW.en_existencia := NEW.disponibles + NEW.comprometido;
    
    -- Update timestamp
    NEW.updated_at := now();
    
    RETURN NEW;
END;
$function$;

-- Create trigger to validate stock values on insert/update
DROP TRIGGER IF EXISTS trigger_validate_stock_values ON stockxbin;
CREATE TRIGGER trigger_validate_stock_values
    BEFORE INSERT OR UPDATE ON stockxbin
    FOR EACH ROW
    EXECUTE FUNCTION validate_stock_values();

-- Run immediate fix for negative stock
SELECT public.fix_negative_committed_stock();