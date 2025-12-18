-- Primero eliminar la función existente para cambiar el tipo de retorno
DROP FUNCTION IF EXISTS public.assign_bins_to_order(uuid);

-- Recrear assign_bins_to_order con retorno JSONB detallado
CREATE OR REPLACE FUNCTION public.assign_bins_to_order(order_id uuid)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    detail_record RECORD;
    stock_record RECORD;
    remaining_quantity INTEGER;
    to_assign INTEGER;
    v_unassigned_items JSONB := '[]'::JSONB;
    v_total_assigned INTEGER := 0;
    v_total_requested INTEGER := 0;
BEGIN
    -- Loop through each item in the order
    FOR detail_record IN 
        SELECT id, sku, nombre_producto, cantidad_solicitada, cantidad_asignada
        FROM pedidos_detalle 
        WHERE pedido_id = order_id
    LOOP
        remaining_quantity := detail_record.cantidad_solicitada - detail_record.cantidad_asignada;
        v_total_requested := v_total_requested + remaining_quantity;
        
        -- Skip if already fully assigned
        IF remaining_quantity <= 0 THEN
            CONTINUE;
        END IF;
        
        -- Find available stock for this SKU, excluding frozen bins
        FOR stock_record IN 
            SELECT s.id, s.bin, s.disponibles, s.comprometido
            FROM stockxbin s
            JOIN bins b ON s.bin = b.bin_code
            WHERE s.sku = detail_record.sku 
              AND s.disponibles > 0
              AND (b.is_frozen = false OR b.is_frozen IS NULL)
            ORDER BY s.disponibles DESC
        LOOP
            IF remaining_quantity <= 0 THEN
                EXIT;
            END IF;
            
            to_assign := LEAST(stock_record.disponibles, remaining_quantity);
            
            -- Create assignment record
            INSERT INTO pedidos_asignaciones (
                pedido_id, pedido_detalle_id, sku, bin, cantidad_asignada, stock_id
            ) VALUES (
                order_id, detail_record.id, detail_record.sku,
                stock_record.bin, to_assign, stock_record.id
            );
            
            -- Update stockxbin
            UPDATE stockxbin 
            SET disponibles = disponibles - to_assign,
                comprometido = comprometido + to_assign,
                updated_at = now()
            WHERE id = stock_record.id;
            
            remaining_quantity := remaining_quantity - to_assign;
            v_total_assigned := v_total_assigned + to_assign;
        END LOOP;
        
        -- Update cantidad_asignada in pedidos_detalle
        UPDATE pedidos_detalle 
        SET cantidad_asignada = cantidad_solicitada - remaining_quantity
        WHERE id = detail_record.id;
        
        -- Si quedó sin asignar, registrar
        IF remaining_quantity > 0 THEN
            v_unassigned_items := v_unassigned_items || jsonb_build_object(
                'sku', detail_record.sku,
                'nombre', detail_record.nombre_producto,
                'solicitado', detail_record.cantidad_solicitada,
                'sin_asignar', remaining_quantity
            );
        END IF;
    END LOOP;
    
    -- Retornar resultado detallado
    RETURN jsonb_build_object(
        'success', jsonb_array_length(v_unassigned_items) = 0,
        'total_requested', v_total_requested,
        'total_assigned', v_total_assigned,
        'unassigned_items', v_unassigned_items
    );
END;
$$;

-- Actualizar create_order_atomic para verificar asignación completa
CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_tienda_id UUID,
  p_tienda_nombre TEXT,
  p_productos JSONB
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
  v_assignment_result JSONB;
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
  
  -- 7. Asignar bins y VERIFICAR resultado
  v_assignment_result := assign_bins_to_order(v_order_id);
  
  -- Si la asignación falló parcialmente, revertir y retornar error
  IF NOT (v_assignment_result->>'success')::boolean THEN
    RAISE EXCEPTION 'PARTIAL_ASSIGNMENT:%', v_assignment_result::text;
  END IF;
  
  -- 8. Retornar éxito con datos del pedido
  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total_items', v_total_items
  );
  
EXCEPTION 
  WHEN OTHERS THEN
    -- Capturar el error de asignación parcial
    IF SQLERRM LIKE 'PARTIAL_ASSIGNMENT:%' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'PARTIAL_ASSIGNMENT',
        'details', (REPLACE(SQLERRM, 'PARTIAL_ASSIGNMENT:', ''))::jsonb
      );
    END IF;
    
    -- Otros errores
    RAISE LOG 'Error en create_order_atomic: %', SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'TRANSACTION_FAILED',
      'message', SQLERRM
    );
END;
$$;