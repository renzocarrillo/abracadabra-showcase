-- Function to clean up orphaned assignments and fix stock inconsistencies
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_assignments()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    cleanup_report jsonb := '{}';
    orphaned_order_assignments RECORD;
    orphaned_sale_assignments RECORD;
    total_orders_cleaned INTEGER := 0;
    total_sales_cleaned INTEGER := 0;
    total_stock_released INTEGER := 0;
BEGIN
    -- Clean up orphaned order assignments (from archived orders)
    FOR orphaned_order_assignments IN 
        SELECT pa.stock_id, pa.cantidad_asignada, pa.pedido_id, p.pedido_id as pedido_codigo
        FROM pedidos_asignaciones pa
        JOIN pedidos p ON pa.pedido_id = p.id
        WHERE p.estado = 'archivado'
    LOOP
        -- Release committed stock back to available
        UPDATE stockxbin 
        SET 
            disponibles = disponibles + orphaned_order_assignments.cantidad_asignada,
            comprometido = comprometido - orphaned_order_assignments.cantidad_asignada,
            updated_at = now()
        WHERE id = orphaned_order_assignments.stock_id;
        
        total_stock_released := total_stock_released + orphaned_order_assignments.cantidad_asignada;
        total_orders_cleaned := total_orders_cleaned + 1;
        
        RAISE NOTICE 'Released % units from archived order %', 
                     orphaned_order_assignments.cantidad_asignada, 
                     orphaned_order_assignments.pedido_codigo;
    END LOOP;
    
    -- Delete all assignments from archived orders
    DELETE FROM pedidos_asignaciones 
    WHERE pedido_id IN (
        SELECT id FROM pedidos WHERE estado = 'archivado'
    );
    
    -- Clean up orphaned sale assignments (from archived sales)
    FOR orphaned_sale_assignments IN 
        SELECT va.stock_id, va.cantidad_asignada, va.venta_id, v.venta_id as venta_codigo
        FROM ventas_asignaciones va
        JOIN ventas v ON va.venta_id = v.id
        WHERE v.estado = 'archivado'
    LOOP
        -- Release committed stock back to available
        UPDATE stockxbin 
        SET 
            disponibles = disponibles + orphaned_sale_assignments.cantidad_asignada,
            comprometido = comprometido - orphaned_sale_assignments.cantidad_asignada,
            updated_at = now()
        WHERE id = orphaned_sale_assignments.stock_id;
        
        total_stock_released := total_stock_released + orphaned_sale_assignments.cantidad_asignada;
        total_sales_cleaned := total_sales_cleaned + 1;
        
        RAISE NOTICE 'Released % units from archived sale %', 
                     orphaned_sale_assignments.cantidad_asignada, 
                     orphaned_sale_assignments.venta_codigo;
    END LOOP;
    
    -- Delete all assignments from archived sales
    DELETE FROM ventas_asignaciones 
    WHERE venta_id IN (
        SELECT id FROM ventas WHERE estado = 'archivado'
    );
    
    -- Build cleanup report
    cleanup_report := jsonb_build_object(
        'orders_cleaned', total_orders_cleaned,
        'sales_cleaned', total_sales_cleaned,
        'total_stock_released', total_stock_released,
        'cleanup_timestamp', now()
    );
    
    RETURN cleanup_report;
END;
$function$;

-- Function to automatically clean up stock when archiving orders/sales
CREATE OR REPLACE FUNCTION public.auto_cleanup_archived_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- Only process when status changes to 'archivado'
    IF NEW.estado = 'archivado' AND OLD.estado != 'archivado' THEN
        
        -- Handle orders (pedidos table)
        IF TG_TABLE_NAME = 'pedidos' THEN
            -- Release all committed stock for this order
            UPDATE stockxbin 
            SET 
                disponibles = disponibles + pa.cantidad_asignada,
                comprometido = comprometido - pa.cantidad_asignada,
                updated_at = now()
            FROM pedidos_asignaciones pa
            WHERE pa.pedido_id = NEW.id 
              AND pa.stock_id = stockxbin.id;
            
            -- Delete the assignments
            DELETE FROM pedidos_asignaciones WHERE pedido_id = NEW.id;
            
            RAISE NOTICE 'Auto-cleaned stock for archived order %', NEW.pedido_id;
        END IF;
        
        -- Handle sales (ventas table)
        IF TG_TABLE_NAME = 'ventas' THEN
            -- Release all committed stock for this sale
            UPDATE stockxbin 
            SET 
                disponibles = disponibles + va.cantidad_asignada,
                comprometido = comprometido - va.cantidad_asignada,
                updated_at = now()
            FROM ventas_asignaciones va
            WHERE va.venta_id = NEW.id 
              AND va.stock_id = stockxbin.id;
            
            -- Delete the assignments
            DELETE FROM ventas_asignaciones WHERE venta_id = NEW.id;
            
            RAISE NOTICE 'Auto-cleaned stock for archived sale %', NEW.venta_id;
        END IF;
        
    END IF;
    
    RETURN NEW;
END;
$function$;

-- Function to detect and report stock inconsistencies
CREATE OR REPLACE FUNCTION public.detect_stock_inconsistencies()
RETURNS TABLE (
    sku text,
    bin text,
    actual_disponibles integer,
    actual_comprometido integer,
    calculated_comprometido integer,
    inconsistency_amount integer,
    issue_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    WITH stock_calculations AS (
        SELECT 
            s.sku,
            s.bin,
            s.disponibles as actual_disponibles,
            s.comprometido as actual_comprometido,
            COALESCE(
                (SELECT SUM(pa.cantidad_asignada) 
                 FROM pedidos_asignaciones pa 
                 JOIN pedidos p ON pa.pedido_id = p.id 
                 WHERE pa.stock_id = s.id AND p.estado NOT IN ('archivado', 'completado')), 0
            ) + COALESCE(
                (SELECT SUM(va.cantidad_asignada) 
                 FROM ventas_asignaciones va 
                 JOIN ventas v ON va.venta_id = v.id 
                 WHERE va.stock_id = s.id AND v.estado NOT IN ('archivado', 'completado')), 0
            ) as calculated_comprometido
        FROM stockxbin s
        WHERE s.sku IS NOT NULL
    )
    SELECT 
        sc.sku,
        sc.bin,
        sc.actual_disponibles,
        sc.actual_comprometido,
        sc.calculated_comprometido,
        (sc.actual_comprometido - sc.calculated_comprometido) as inconsistency_amount,
        CASE 
            WHEN sc.actual_comprometido > sc.calculated_comprometido THEN 'Over-committed'
            WHEN sc.actual_comprometido < sc.calculated_comprometido THEN 'Under-committed'
            ELSE 'Consistent'
        END as issue_type
    FROM stock_calculations sc
    WHERE sc.actual_comprometido != sc.calculated_comprometido;
END;
$function$;

-- Function to fix stock inconsistencies
CREATE OR REPLACE FUNCTION public.fix_stock_inconsistencies()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    inconsistency_record RECORD;
    fixes_applied INTEGER := 0;
    total_units_fixed INTEGER := 0;
    fix_report jsonb := '{}';
BEGIN
    -- Fix each inconsistency
    FOR inconsistency_record IN 
        SELECT * FROM public.detect_stock_inconsistencies()
        WHERE issue_type != 'Consistent'
    LOOP
        -- Update the stock to match calculated committed amount
        UPDATE stockxbin 
        SET 
            comprometido = inconsistency_record.calculated_comprometido,
            disponibles = disponibles + (comprometido - inconsistency_record.calculated_comprometido),
            updated_at = now()
        WHERE sku = inconsistency_record.sku 
          AND bin = inconsistency_record.bin;
        
        fixes_applied := fixes_applied + 1;
        total_units_fixed := total_units_fixed + ABS(inconsistency_record.inconsistency_amount);
        
        RAISE NOTICE 'Fixed % inconsistency for SKU % in bin %: % units', 
                     inconsistency_record.issue_type,
                     inconsistency_record.sku,
                     inconsistency_record.bin,
                     inconsistency_record.inconsistency_amount;
    END LOOP;
    
    fix_report := jsonb_build_object(
        'fixes_applied', fixes_applied,
        'total_units_fixed', total_units_fixed,
        'fix_timestamp', now()
    );
    
    RETURN fix_report;
END;
$function$;

-- Create triggers for automatic cleanup when archiving
CREATE TRIGGER trigger_auto_cleanup_archived_orders
    BEFORE UPDATE ON pedidos
    FOR EACH ROW
    EXECUTE FUNCTION auto_cleanup_archived_stock();

CREATE TRIGGER trigger_auto_cleanup_archived_sales
    BEFORE UPDATE ON ventas
    FOR EACH ROW
    EXECUTE FUNCTION auto_cleanup_archived_stock();

-- Run immediate cleanup
SELECT public.cleanup_orphaned_assignments();