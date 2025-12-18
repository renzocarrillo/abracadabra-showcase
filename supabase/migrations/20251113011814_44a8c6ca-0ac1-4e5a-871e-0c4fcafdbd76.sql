-- Create intelligent stock consumption function with fallback for tickets
CREATE OR REPLACE FUNCTION public.consume_stock_for_sale_fallback(sale_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  assignments_count INTEGER;
  consumed_count INTEGER := 0;
  detail_record RECORD;
  available_stock_id uuid;
BEGIN
  -- Verificar si existen asignaciones
  SELECT COUNT(*) INTO assignments_count
  FROM ventas_asignaciones 
  WHERE venta_id = sale_id_param;
  
  IF assignments_count > 0 THEN
    -- CASO A: Hay asignaciones -> consumir desde comprometido (flujo normal)
    UPDATE stockxbin s
    SET 
      comprometido = comprometido - va.cantidad_asignada,
      en_existencia = en_existencia - va.cantidad_asignada,
      updated_at = now()
    FROM ventas_asignaciones va
    WHERE va.venta_id = sale_id_param 
      AND va.stock_id = s.id;
    
    GET DIAGNOSTICS consumed_count = ROW_COUNT;
    
    RETURN jsonb_build_object(
      'success', true,
      'method', 'from_assignments',
      'items_consumed', consumed_count
    );
  ELSE
    -- CASO B: NO hay asignaciones -> consumir directamente desde disponibles (fallback)
    FOR detail_record IN 
      SELECT sku, cantidad
      FROM ventas_detalle 
      WHERE venta_id = sale_id_param
    LOOP
      -- Buscar el primer bin con stock disponible suficiente
      SELECT id INTO available_stock_id
      FROM stockxbin 
      WHERE sku = detail_record.sku 
        AND disponibles >= detail_record.cantidad
      ORDER BY disponibles DESC
      LIMIT 1;
      
      -- Si se encontró stock disponible, consumirlo
      IF available_stock_id IS NOT NULL THEN
        UPDATE stockxbin
        SET 
          disponibles = disponibles - detail_record.cantidad,
          en_existencia = en_existencia - detail_record.cantidad,
          updated_at = now()
        WHERE id = available_stock_id;
        
        consumed_count := consumed_count + 1;
      ELSE
        -- Log warning pero no fallar (el documento ya fue emitido)
        RAISE NOTICE 'WARNING: No stock available for SKU % (quantity needed: %)', 
                     detail_record.sku, detail_record.cantidad;
      END IF;
    END LOOP;
    
    RETURN jsonb_build_object(
      'success', true,
      'method', 'fallback_from_disponibles',
      'items_consumed', consumed_count,
      'warning', 'No assignments found - consumed directly from disponibles'
    );
  END IF;
END;
$function$;