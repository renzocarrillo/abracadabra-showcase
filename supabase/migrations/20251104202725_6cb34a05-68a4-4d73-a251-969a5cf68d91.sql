-- Fix trigger function to use SECURITY DEFINER so it can update stock_totals regardless of user
CREATE OR REPLACE FUNCTION public.update_stock_totals_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER -- Critical: Run with elevated privileges
SET search_path = public
AS $function$
BEGIN
    -- Handle INSERT and UPDATE
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        INSERT INTO stock_totals (sku, total_disponible, total_comprometido, total_en_existencia)
        SELECT 
            NEW.sku,
            COALESCE(SUM(disponibles), 0),
            COALESCE(SUM(comprometido), 0),
            COALESCE(SUM(en_existencia), 0)
        FROM stockxbin 
        WHERE sku = NEW.sku
        GROUP BY sku
        ON CONFLICT (sku) DO UPDATE SET
            total_disponible = EXCLUDED.total_disponible,
            total_comprometido = EXCLUDED.total_comprometido,
            total_en_existencia = EXCLUDED.total_en_existencia,
            updated_at = now();
    END IF;
    
    -- Handle DELETE or UPDATE with sku change
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.sku != NEW.sku) THEN
        INSERT INTO stock_totals (sku, total_disponible, total_comprometido, total_en_existencia)
        SELECT 
            OLD.sku,
            COALESCE(SUM(disponibles), 0),
            COALESCE(SUM(comprometido), 0),
            COALESCE(SUM(en_existencia), 0)
        FROM stockxbin 
        WHERE sku = OLD.sku
        GROUP BY sku
        ON CONFLICT (sku) DO UPDATE SET
            total_disponible = EXCLUDED.total_disponible,
            total_comprometido = EXCLUDED.total_comprometido,
            total_en_existencia = EXCLUDED.total_en_existencia,
            updated_at = now();
            
        -- If no records exist for this sku, delete from totals
        IF NOT EXISTS (SELECT 1 FROM stockxbin WHERE sku = OLD.sku) THEN
            DELETE FROM stock_totals WHERE sku = OLD.sku;
        END IF;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$function$;