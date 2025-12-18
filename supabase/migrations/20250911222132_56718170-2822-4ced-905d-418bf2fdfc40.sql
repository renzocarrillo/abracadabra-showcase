-- Fix assign_bins_to_sale function to clear existing assignments before reassigning
CREATE OR REPLACE FUNCTION public.assign_bins_to_sale(sale_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    detail_record RECORD;
    stock_record RECORD;
    remaining_quantity INTEGER;
    to_assign INTEGER;
BEGIN
    -- First, revert any existing assignments for this sale
    -- Move comprometido back to disponibles for existing assignments
    UPDATE stockxbin 
    SET 
        disponibles = disponibles + va.cantidad_asignada,
        comprometido = comprometido - va.cantidad_asignada,
        updated_at = now()
    FROM ventas_asignaciones va
    WHERE va.venta_id = sale_id 
      AND va.stock_id = stockxbin.id;
    
    -- Delete existing assignments for this sale
    DELETE FROM ventas_asignaciones WHERE venta_id = sale_id;
    
    -- Now create new assignments based on current ventas_detalle
    FOR detail_record IN 
        SELECT id, sku, cantidad
        FROM ventas_detalle 
        WHERE venta_id = sale_id
    LOOP
        remaining_quantity := detail_record.cantidad;
        
        -- Skip if no quantity needed
        IF remaining_quantity <= 0 THEN
            CONTINUE;
        END IF;
        
        -- Find available stock for this SKU, ordered by disponibles DESC
        FOR stock_record IN 
            SELECT id, bin, disponibles, comprometido
            FROM stockxbin 
            WHERE sku = detail_record.sku AND disponibles > 0
            ORDER BY disponibles DESC
        LOOP
            IF remaining_quantity <= 0 THEN
                EXIT;
            END IF;
            
            -- Calculate how much to assign from this bin
            to_assign := LEAST(stock_record.disponibles, remaining_quantity);
            
            -- Create assignment record
            INSERT INTO ventas_asignaciones (
                venta_id, 
                venta_detalle_id, 
                sku, 
                bin, 
                cantidad_asignada, 
                stock_id
            ) VALUES (
                sale_id,
                detail_record.id,
                detail_record.sku,
                stock_record.bin,
                to_assign,
                stock_record.id
            );
            
            -- Update stockxbin: move from disponibles to comprometido
            UPDATE stockxbin 
            SET 
                disponibles = disponibles - to_assign,
                comprometido = comprometido + to_assign,
                updated_at = now()
            WHERE id = stock_record.id;
            
            remaining_quantity := remaining_quantity - to_assign;
        END LOOP;
    END LOOP;
    
    RETURN true;
END;
$function$;