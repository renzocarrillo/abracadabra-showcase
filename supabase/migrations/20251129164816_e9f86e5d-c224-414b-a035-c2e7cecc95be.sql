-- Create atomic RPC for order creation
CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_tienda_id UUID,
  p_tienda_nombre TEXT,
  p_productos JSONB  -- Array de {sku, nombre_producto, variante, cantidad_solicitada}
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_number TEXT;
  v_order_id UUID;
  v_total_items INTEGER;
  v_detail_record JSONB;
  v_stock_problems JSONB := '[]'::JSONB;
  v_current_stock INTEGER;
  v_is_frozen BOOLEAN;
BEGIN
  -- 1. Verificar stock disponible para todos los productos
  FOR v_detail_record IN SELECT * FROM jsonb_array_elements(p_productos)
  LOOP
    SELECT COALESCE(SUM(disponibles), 0) INTO v_current_stock
    FROM stockxbin
    WHERE sku = v_detail_record->>'sku';
    
    IF v_current_stock < (v_detail_record->>'cantidad_solicitada')::INTEGER THEN
      v_stock_problems := v_stock_problems || jsonb_build_object(
        'sku', v_detail_record->>'sku',
        'nombre', v_detail_record->>'nombre_producto',
        'solicitado', (v_detail_record->>'cantidad_solicitada')::INTEGER,
        'disponible', v_current_stock
      );
    END IF;
    
    -- 2. Verificar si está congelado
    SELECT is_product_frozen_for_transfer(v_detail_record->>'sku') INTO v_is_frozen;
    IF v_is_frozen THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'FROZEN_PRODUCT',
        'sku', v_detail_record->>'sku',
        'nombre', v_detail_record->>'nombre_producto'
      );
    END IF;
  END LOOP;
  
  -- Si hay problemas de stock, retornar error (sin crear nada)
  IF jsonb_array_length(v_stock_problems) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_STOCK',
      'details', v_stock_problems
    );
  END IF;
  
  -- 3. Obtener número de pedido (dentro de la transacción)
  SELECT get_next_order_number() INTO v_order_number;
  
  -- 4. Calcular total de items
  SELECT SUM((value->>'cantidad_solicitada')::INTEGER) INTO v_total_items
  FROM jsonb_array_elements(p_productos);
  
  -- 5. Insertar pedido
  INSERT INTO pedidos (pedido_id, tienda_id, tienda_nombre, total_items, estado)
  VALUES (v_order_number, p_tienda_id, p_tienda_nombre, v_total_items, 'pendiente')
  RETURNING id INTO v_order_id;
  
  -- 6. Insertar detalles
  INSERT INTO pedidos_detalle (pedido_id, sku, nombre_producto, variante, cantidad_solicitada, cantidad_asignada)
  SELECT 
    v_order_id,
    value->>'sku',
    value->>'nombre_producto',
    value->>'variante',
    (value->>'cantidad_solicitada')::INTEGER,
    0
  FROM jsonb_array_elements(p_productos);
  
  -- 7. Asignar bins (llama a la función existente)
  PERFORM assign_bins_to_order(v_order_id);
  
  -- 8. Retornar éxito con datos del pedido
  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total_items', v_total_items
  );
  
EXCEPTION WHEN OTHERS THEN
  -- Si cualquier cosa falla, la transacción se revierte automáticamente
  RAISE LOG 'Error en create_order_atomic: %', SQLERRM;
  RETURN jsonb_build_object(
    'success', false,
    'error', 'TRANSACTION_FAILED',
    'message', SQLERRM
  );
END;
$$;