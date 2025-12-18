-- Corregir la función auto_cleanup_archived_stock para que use cast explícito en log_venta_state_change
CREATE OR REPLACE FUNCTION public.auto_cleanup_archived_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_assignment_count INTEGER;
BEGIN
    IF NEW.estado = 'archivado' AND OLD.estado != 'archivado' THEN
        RAISE NOTICE '[AUTO_CLEANUP] Trigger activado: tabla=%, venta=%', TG_TABLE_NAME, NEW.venta_id;
        
        IF TG_TABLE_NAME = 'ventas' THEN
            SELECT COUNT(*) INTO v_assignment_count FROM ventas_asignaciones WHERE venta_id = NEW.id;
            RAISE NOTICE '[AUTO_CLEANUP] Asignaciones encontradas: %', v_assignment_count;
            
            IF v_assignment_count > 0 THEN
                RAISE WARNING '[AUTO_CLEANUP] 🚨 Liberando stock comprometido para venta % - % asignaciones', NEW.venta_id, v_assignment_count;
                
                UPDATE stockxbin 
                SET disponibles = disponibles + va.cantidad_asignada, comprometido = comprometido - va.cantidad_asignada, updated_at = now()
                FROM ventas_asignaciones va
                WHERE va.venta_id = NEW.id AND va.stock_id = stockxbin.id;
                
                -- FIX: Agregar cast explícito NULL::uuid para el parámetro p_usuario_id
                PERFORM log_venta_state_change(
                  NEW.id, 
                  NEW.venta_id, 
                  'auto_cleanup_trigger', 
                  OLD.estado, 
                  NEW.estado, 
                  NULL::uuid,
                  'Sistema',
                  jsonb_build_object('asignaciones_liberadas', v_assignment_count, 'warning', 'Stock liberado por trigger')
                );
                
                DELETE FROM ventas_asignaciones WHERE venta_id = NEW.id;
                RAISE NOTICE '[AUTO_CLEANUP] Asignaciones eliminadas';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;