-- Eliminar ambas versiones existentes del RPC create_order_atomic
DROP FUNCTION IF EXISTS public.create_order_atomic(uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.create_order_atomic(text, uuid, jsonb);

-- Recrear una única versión con la firma correcta que espera el frontend
-- y con TODAS las protecciones de concurrencia
CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_tienda_id uuid,
  p_tienda_nombre text,
  p_productos jsonb  -- Array de {sku, nombre_producto, variante, cantidad_solicitada}
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
        'message', 'Producto congelado: ' || (v_product->>'nombre_producto')
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
      v_requested_quantity := (v_product->>'cantidad_solicitada')::integer;
      
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
              'nombre', v_product->>'nombre_producto',
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
    v_total_items := v_total_items + (v_product->>'cantidad_solicitada')::integer;
  END LOOP;

  -- 5. Crear el pedido
  INSERT INTO pedidos (
    pedido_id, tipo, estado, tienda_id, tienda_nombre, total_items
  ) VALUES (
    v_order_number,
    'traslado',
    'pendiente',
    p_tienda_id,
    p_tienda_nombre,
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
      v_product->>'nombre_producto',
      v_product->>'variante',
      (v_product->>'cantidad_solicitada')::integer
    )
    RETURNING id INTO v_detalle_id;
  END LOOP;

  -- 7. Asignar bins con bloqueo pesimista (assign_bins_to_order ya tiene FOR UPDATE SKIP LOCKED)
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
    -- Error de constraint de stock negativo (race condition detectada por DB)
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