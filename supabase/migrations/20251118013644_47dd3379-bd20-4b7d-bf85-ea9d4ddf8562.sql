-- Fix refresh_stock_totals to avoid DELETE without WHERE and make it safer
CREATE OR REPLACE FUNCTION public.refresh_stock_totals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Safer and faster than DELETE without WHERE in this environment
  TRUNCATE TABLE public.stock_totals RESTART IDENTITY;

  -- Recalculate aggregated stock data
  INSERT INTO public.stock_totals (sku, total_disponible, total_comprometido, total_en_existencia)
  SELECT 
      sku,
      COALESCE(SUM(disponibles), 0) as total_disponible,
      COALESCE(SUM(comprometido), 0) as total_comprometido,
      COALESCE(SUM(en_existencia), 0) as total_en_existencia
  FROM public.stockxbin 
  WHERE sku IS NOT NULL
  GROUP BY sku;
END;
$function$;

-- Add defensive handling in consume_stock_strict so a totals refresh failure never blocks the sale processing
CREATE OR REPLACE FUNCTION public.consume_stock_strict(sale_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  assignment_record RECORD;
  consumed_count INTEGER := 0;
  total_units INTEGER := 0;
  v_venta_id TEXT;
  v_sale_details jsonb := '[]'::jsonb;
BEGIN
  -- Obtener código de venta
  SELECT venta_id INTO v_venta_id FROM ventas WHERE id = sale_id_param;
  RAISE NOTICE '🔵 [CONSUME_STRICT] Iniciando consumo para venta %', v_venta_id;

  -- VALIDACIÓN CRÍTICA: Verificar que existen asignaciones
  IF NOT EXISTS (SELECT 1 FROM ventas_asignaciones WHERE venta_id = sale_id_param) THEN
    RAISE NOTICE '❌ [CONSUME_STRICT] ERROR: No existen asignaciones para venta %', v_venta_id;
    RETURN jsonb_build_object(
      'success', false,
      'venta_id', v_venta_id,
      'error', 'CRITICAL_ERROR',
      'message', format('No se encontraron asignaciones para la venta %s. No se puede consumir stock sin asignaciones válidas.', v_venta_id),
      'records_processed', 0,
      'total_units', 0
    );
  END IF;

  -- Consumir desde comprometido usando las asignaciones
  FOR assignment_record IN 
    SELECT va.stock_id, va.cantidad_asignada, va.sku, va.bin, s.comprometido, s.en_existencia
    FROM ventas_asignaciones va
    JOIN stockxbin s ON s.id = va.stock_id
    WHERE va.venta_id = sale_id_param
  LOOP
    -- VALIDACIÓN: Verificar que hay stock comprometido suficiente
    IF assignment_record.comprometido < assignment_record.cantidad_asignada THEN
      RAISE WARNING '⚠️  Stock comprometido insuficiente en bin %: tiene % pero necesita %', 
                    assignment_record.bin, 
                    assignment_record.comprometido, 
                    assignment_record.cantidad_asignada;
    END IF;

    -- Consumir desde comprometido y en_existencia
    UPDATE stockxbin 
    SET 
      comprometido = GREATEST(0, comprometido - assignment_record.cantidad_asignada),
      en_existencia = GREATEST(0, en_existencia - assignment_record.cantidad_asignada),
      updated_at = now()
    WHERE id = assignment_record.stock_id;

    consumed_count := consumed_count + 1;
    total_units := total_units + assignment_record.cantidad_asignada;

    -- Acumular detalles para audit log
    v_sale_details := v_sale_details || jsonb_build_object(
      'sku', assignment_record.sku,
      'bin', assignment_record.bin,
      'cantidad', assignment_record.cantidad_asignada,
      'comprometido_antes', assignment_record.comprometido,
      'en_existencia_antes', assignment_record.en_existencia
    );

    RAISE NOTICE '  ✓ Consumido % unidades de % desde bin %', 
                 assignment_record.cantidad_asignada,
                 assignment_record.sku,
                 assignment_record.bin;
  END LOOP;

  -- Refresh stock totals (non-blocking)
  BEGIN
    PERFORM refresh_stock_totals();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '⚠️ refresh_stock_totals failed: %', SQLERRM;
  END;

  -- Registrar en audit log
  PERFORM log_venta_state_change(
    sale_id_param,
    v_venta_id,
    'consumo_stock',
    NULL,
    NULL,
    NULL,
    NULL,
    jsonb_build_object(
      'metodo', 'strict_assignments',
      'registros_procesados', consumed_count,
      'unidades_totales', total_units,
      'detalles', v_sale_details
    )
  );

  RAISE NOTICE '✅ [CONSUME_STRICT] Consumo exitoso para venta %: % unidades en % registros', v_venta_id, total_units, consumed_count;

  RETURN jsonb_build_object(
    'success', true,
    'venta_id', v_venta_id,
    'method', 'strict_assignments',
    'records_processed', consumed_count,
    'total_units', total_units,
    'message', format('Stock consumido exitosamente: %s unidades desde %s bins', total_units, consumed_count)
  );
END;
$function$;