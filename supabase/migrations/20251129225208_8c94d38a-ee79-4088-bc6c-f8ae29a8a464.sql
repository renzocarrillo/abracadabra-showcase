-- Paso 1: Corregir la función auto_cleanup_archived_stock para manejar pedidos correctamente
CREATE OR REPLACE FUNCTION public.auto_cleanup_archived_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_assignment_count INTEGER;
  v_record_id TEXT;
BEGIN
    IF NEW.estado = 'archivado' AND OLD.estado != 'archivado' THEN
        -- Determinar el ID correcto según la tabla
        IF TG_TABLE_NAME = 'ventas' THEN
            v_record_id := NEW.venta_id;
        ELSIF TG_TABLE_NAME = 'pedidos' THEN
            v_record_id := NEW.pedido_id;
        ELSE
            v_record_id := NEW.id::TEXT;
        END IF;
        
        RAISE NOTICE '[AUTO_CLEANUP] Trigger activado: tabla=%, id=%', TG_TABLE_NAME, v_record_id;
        
        -- Solo procesar cleanup de asignaciones para ventas
        IF TG_TABLE_NAME = 'ventas' THEN
            SELECT COUNT(*) INTO v_assignment_count FROM ventas_asignaciones WHERE venta_id = NEW.id;
            RAISE NOTICE '[AUTO_CLEANUP] Asignaciones encontradas: %', v_assignment_count;
            
            IF v_assignment_count > 0 THEN
                RAISE WARNING '[AUTO_CLEANUP] 🚨 Liberando stock comprometido para venta % - % asignaciones', NEW.venta_id, v_assignment_count;
                
                UPDATE stockxbin 
                SET disponibles = disponibles + va.cantidad_asignada, 
                    comprometido = comprometido - va.cantidad_asignada, 
                    updated_at = now()
                FROM ventas_asignaciones va
                WHERE va.venta_id = NEW.id AND va.stock_id = stockxbin.id;
                
                PERFORM log_venta_state_change(
                  NEW.id,
                  NEW.venta_id,
                  'auto_cleanup_trigger'::TEXT,
                  OLD.estado::TEXT,
                  NEW.estado::TEXT,
                  NULL::uuid,
                  'Sistema'::TEXT,
                  jsonb_build_object('asignaciones_liberadas', v_assignment_count, 'warning', 'Stock liberado por trigger')
                );
                
                DELETE FROM ventas_asignaciones WHERE venta_id = NEW.id;
                RAISE NOTICE '[AUTO_CLEANUP] Asignaciones eliminadas';
            END IF;
        END IF;
        
        -- Para pedidos, no hay cleanup de asignaciones necesario
        -- El trigger simplemente permite la actualización
    END IF;
    RETURN NEW;
END;
$function$;

-- Paso 2: Archivar el pedido PED-20251129-0001 manualmente
UPDATE pedidos 
SET estado = 'archivado', 
    url_public_view = 'https://app2.bsale.com.pe/view/85427/495b9b7b958f?sfd=99',
    updated_at = now()
WHERE pedido_id = 'PED-20251129-0001';