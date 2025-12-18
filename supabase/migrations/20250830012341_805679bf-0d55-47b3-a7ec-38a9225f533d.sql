-- Function to move stock from disponibles to comprometido when an order is created
CREATE OR REPLACE FUNCTION public.commit_stock_for_order()
RETURNS TRIGGER AS $$
DECLARE
    needed_quantity INTEGER;
    available_record RECORD;
    remaining_quantity INTEGER;
BEGIN
    -- Only process INSERT operations (new orders)
    IF TG_OP = 'INSERT' THEN
        needed_quantity := NEW.cantidad;
        remaining_quantity := needed_quantity;
        
        -- Find available stock for this SKU, ordered by disponibles DESC to prioritize bins with more stock
        FOR available_record IN 
            SELECT id, disponibles, comprometido
            FROM stockxbin 
            WHERE sku = NEW.sku AND disponibles > 0
            ORDER BY disponibles DESC
        LOOP
            IF remaining_quantity <= 0 THEN
                EXIT;
            END IF;
            
            -- Calculate how much we can take from this bin
            DECLARE
                to_commit INTEGER := LEAST(available_record.disponibles, remaining_quantity);
            BEGIN
                -- Update the stock record
                UPDATE stockxbin 
                SET 
                    disponibles = disponibles - to_commit,
                    comprometido = comprometido + to_commit
                WHERE id = available_record.id;
                
                remaining_quantity := remaining_quantity - to_commit;
            END;
        END LOOP;
        
        -- If we couldn't fulfill the entire order, log a warning
        IF remaining_quantity > 0 THEN
            RAISE WARNING 'No hay suficiente stock disponible para SKU %. Faltaron % unidades.', NEW.sku, remaining_quantity;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql 
SET search_path = 'public';

-- Create trigger for automatic stock commitment
DROP TRIGGER IF EXISTS commit_stock_on_order_insert ON "pedidos2.0";
CREATE TRIGGER commit_stock_on_order_insert
    AFTER INSERT ON "pedidos2.0"
    FOR EACH ROW
    EXECUTE FUNCTION public.commit_stock_for_order();