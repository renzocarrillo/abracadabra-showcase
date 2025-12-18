-- Create improved RPC function to consume stock for sales with fallback logic
CREATE OR REPLACE FUNCTION public.consume_stock_for_sale_fallback(sale_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  assignment_record RECORD;
  detail_record RECORD;
  stock_record RECORD;
  consumed_count INTEGER := 0;
  total_units INTEGER := 0;
  method_used TEXT := 'assignments';
  warning_message TEXT := NULL;
BEGIN
  -- First try: Use existing assignments (preferred method)
  FOR assignment_record IN 
    SELECT va.stock_id, va.cantidad_asignada, va.sku, va.bin
    FROM ventas_asignaciones va
    WHERE va.venta_id = sale_id_param
  LOOP
    -- Consume from comprometido and en_existencia
    UPDATE stockxbin 
    SET 
      comprometido = GREATEST(0, comprometido - assignment_record.cantidad_asignada),
      en_existencia = GREATEST(0, en_existencia - assignment_record.cantidad_asignada),
      updated_at = now()
    WHERE id = assignment_record.stock_id;
    
    consumed_count := consumed_count + 1;
    total_units := total_units + assignment_record.cantidad_asignada;
    
    RAISE NOTICE 'Consumed % units of % from bin % (via assignment)', 
                 assignment_record.cantidad_asignada,
                 assignment_record.sku,
                 assignment_record.bin;
  END LOOP;
  
  -- If we consumed via assignments, we're done
  IF consumed_count > 0 THEN
    -- Refresh stock totals
    PERFORM refresh_stock_totals();
    
    RETURN jsonb_build_object(
      'success', true,
      'method', 'assignments',
      'records_processed', consumed_count,
      'total_units', total_units,
      'message', format('Stock consumed successfully using %s assignments', consumed_count)
    );
  END IF;
  
  -- Fallback: No assignments found, consume from available stock
  RAISE NOTICE 'No assignments found for sale %, using fallback method', sale_id_param;
  method_used := 'fallback_disponibles';
  warning_message := 'WARNING: No assignments found, consumed from available stock directly';
  
  FOR detail_record IN 
    SELECT sku, cantidad
    FROM ventas_detalle 
    WHERE venta_id = sale_id_param
  LOOP
    -- Find available stock for this SKU
    FOR stock_record IN 
      SELECT id, bin, disponibles
      FROM stockxbin 
      WHERE sku = detail_record.sku 
        AND disponibles > 0
      ORDER BY disponibles DESC
    LOOP
      DECLARE
        to_consume INTEGER := LEAST(stock_record.disponibles, detail_record.cantidad);
      BEGIN
        -- Consume from disponibles and en_existencia
        UPDATE stockxbin 
        SET 
          disponibles = GREATEST(0, disponibles - to_consume),
          en_existencia = GREATEST(0, en_existencia - to_consume),
          updated_at = now()
        WHERE id = stock_record.id;
        
        consumed_count := consumed_count + 1;
        total_units := total_units + to_consume;
        detail_record.cantidad := detail_record.cantidad - to_consume;
        
        RAISE NOTICE 'Fallback: Consumed % units of % from bin %', 
                     to_consume,
                     detail_record.sku,
                     stock_record.bin;
        
        EXIT WHEN detail_record.cantidad <= 0;
      END;
    END LOOP;
  END LOOP;
  
  -- Refresh stock totals
  PERFORM refresh_stock_totals();
  
  RETURN jsonb_build_object(
    'success', true,
    'method', method_used,
    'records_processed', consumed_count,
    'total_units', total_units,
    'warning', warning_message,
    'message', format('Stock consumed using fallback method: %s records, %s units', consumed_count, total_units)
  );
END;
$$;