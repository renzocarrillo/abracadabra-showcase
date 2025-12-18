-- Modificar assign_bins_to_order con bloqueo pesimista para prevenir race conditions
DROP FUNCTION IF EXISTS public.assign_bins_to_order(uuid);

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
    v_new_disponibles INTEGER;
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
        
        -- Find available stock for this SKU with pessimistic locking
        -- FOR UPDATE OF s SKIP LOCKED: Bloquea filas de stockxbin y salta las ya bloqueadas
        FOR stock_record IN 
            SELECT s.id, s.bin, s.disponibles, s.comprometido
            FROM stockxbin s
            JOIN bins b ON s.bin = b.bin_code
            WHERE s.sku = detail_record.sku 
              AND s.disponibles > 0
              AND (b.is_frozen = false OR b.is_frozen IS NULL)
            ORDER BY s.disponibles DESC
            FOR UPDATE OF s SKIP LOCKED
        LOOP
            IF remaining_quantity <= 0 THEN
                EXIT;
            END IF;
            
            to_assign := LEAST(stock_record.disponibles, remaining_quantity);
            
            -- Update stockxbin with additional safety condition
            UPDATE stockxbin 
            SET disponibles = disponibles - to_assign,
                comprometido = comprometido + to_assign,
                updated_at = now()
            WHERE id = stock_record.id
              AND disponibles >= to_assign
            RETURNING disponibles INTO v_new_disponibles;
            
            -- Si el UPDATE no afectó filas (stock consumido por otra transacción)
            IF NOT FOUND THEN
                -- Continuar al siguiente bin disponible
                CONTINUE;
            END IF;
            
            -- Create assignment record
            INSERT INTO pedidos_asignaciones (
                pedido_id, pedido_detalle_id, sku, bin, cantidad_asignada, stock_id
            ) VALUES (
                order_id, detail_record.id, detail_record.sku,
                stock_record.bin, to_assign, stock_record.id
            );
            
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

-- Modificar create_order_atomic para manejar errores de concurrencia específicos
DROP FUNCTION IF EXISTS public.create_order_atomic(text, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_tipo text,
  p_tienda_id uuid,
  p_productos jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order_id uuid;
  v_order_number text;
  v_total_items integer := 0;
  v_product jsonb;
  v_detalle_id uuid;
  v_assignment_result JSONB;
BEGIN
  -- 1. Validar que todos los productos existan y no estén congelados
  FOR v_product IN SELECT * FROM jsonb_array_elements(p_productos)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM variants 
      WHERE sku = (v_product->>'sku')
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'PRODUCT_NOT_FOUND',
        'message', 'Producto no encontrado: ' || (v_product->>'sku')
      );
    END IF;

    IF EXISTS (
      SELECT 1 FROM productos_congelados 
      WHERE sku = (v_product->>'sku')
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'FROZEN_PRODUCT',
        'message', 'Producto congelado: ' || (v_product->>'nombre')
      );
    END IF;
  END LOOP;

  -- 2. Validar stock disponible para cada producto
  FOR v_product IN SELECT * FROM jsonb_array_elements(p_productos)
  LOOP
    DECLARE
      v_available_stock integer;
      v_requested_quantity integer;
    BEGIN
      v_requested_quantity := (v_product->>'quantity')::integer;
      
      SELECT COALESCE(SUM(s.disponibles), 0)
      INTO v_available_stock
      FROM stockxbin s
      JOIN bins b ON s.bin = b.bin_code
      WHERE s.sku = (v_product->>'sku')
        AND (b.is_frozen = false OR b.is_frozen IS NULL);

      IF v_available_stock < v_requested_quantity THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'INSUFFICIENT_STOCK',
          'details', jsonb_build_array(
            jsonb_build_object(
              'sku', v_product->>'sku',
              'nombre', v_product->>'nombre',
              'solicitado', v_requested_quantity,
              'disponible', v_available_stock
            )
          )
        );
      END IF;
    END;
  END LOOP;

  -- 3. Generar número de pedido secuencial
  v_order_number := 'PED-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || 
                    LPAD(NEXTVAL('pedidos_sequence')::TEXT, 4, '0');

  -- 4. Calcular total de items
  FOR v_product IN SELECT * FROM jsonb_array_elements(p_productos)
  LOOP
    v_total_items := v_total_items + (v_product->>'quantity')::integer;
  END LOOP;

  -- 5. Crear el pedido
  INSERT INTO pedidos (
    pedido_id, tipo, estado, tienda_id, tienda_nombre, total_items
  ) VALUES (
    v_order_number,
    p_tipo,
    'pendiente',
    p_tienda_id,
    (SELECT nombre FROM tiendas WHERE id = p_tienda_id),
    v_total_items
  )
  RETURNING id INTO v_order_id;

  -- 6. Insertar los detalles del pedido
  FOR v_product IN SELECT * FROM jsonb_array_elements(p_productos)
  LOOP
    INSERT INTO pedidos_detalle (
      pedido_id, sku, nombre_producto, variante, cantidad_solicitada
    ) VALUES (
      v_order_id,
      v_product->>'sku',
      v_product->>'nombre',
      v_product->>'variante',
      (v_product->>'quantity')::integer
    )
    RETURNING id INTO v_detalle_id;
  END LOOP;

  -- 7. Asignar bins y verificar resultado
  v_assignment_result := assign_bins_to_order(v_order_id);
  
  -- Si la asignación falló parcialmente, revertir y retornar error
  IF NOT (v_assignment_result->>'success')::boolean THEN
    RAISE EXCEPTION 'PARTIAL_ASSIGNMENT:%', v_assignment_result::text;
  END IF;

  -- 8. Registrar en audit log
  INSERT INTO pedidos_audit_log (
    pedido_id, pedido_codigo, accion, estado_nuevo
  ) VALUES (
    v_order_id, v_order_number, 'PEDIDO_CREADO', 'pendiente'
  );

  -- 9. Retornar éxito
  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total_items', v_total_items
  );

EXCEPTION 
  WHEN OTHERS THEN
    -- Error de constraint de stock negativo (race condition detectada)
    IF SQLERRM LIKE '%check_disponibles_not_negative%' OR 
       SQLERRM LIKE '%check_committed_not_negative%' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'CONCURRENT_STOCK_CONFLICT',
        'message', 'Otro usuario está asignando el mismo stock. Por favor, intente de nuevo.'
      );
    END IF;
    
    -- Error de asignación parcial
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