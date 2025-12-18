-- Crear RPC unificado para escaneo de productos en picking libre
-- Optimiza el flujo de escaneo reduciendo de 6 llamadas a 1

CREATE OR REPLACE FUNCTION scan_product_unified(
  p_session_id UUID,
  p_sku TEXT,
  p_bin_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  session_record RECORD;
  stock_record RECORD;
  item_record RECORD;
  total_scanned INTEGER := 0;
  ttl_minutes INTEGER := 30;
  cutoff_time TIMESTAMPTZ;
  producto_congelado BOOLEAN;
BEGIN
  -- SEGURIDAD: Obtener el usuario autenticado (no confiar en parámetros del cliente)
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'UNAUTHORIZED',
      'message', 'Usuario no autenticado'
    );
  END IF;

  -- 1. Verificar sesión y validar propiedad
  SELECT id, status, created_by 
  INTO session_record
  FROM picking_libre_sessions
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'SESSION_INVALID',
      'message', 'Sesión no encontrada'
    );
  END IF;

  -- SEGURIDAD: Validar que el usuario es el dueño de la sesión
  IF session_record.created_by != v_user_id THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'SESSION_PERMISSION',
      'message', 'No tienes permiso para modificar esta sesión'
    );
  END IF;

  IF session_record.status != 'en_proceso' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'SESSION_CLOSED',
      'message', 'La sesión no está activa'
    );
  END IF;

  -- 2. Verificar producto congelado
  SELECT EXISTS (
    SELECT 1 FROM productos_congelados WHERE sku = p_sku
  ) INTO producto_congelado;

  IF producto_congelado THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'PRODUCT_FROZEN',
      'message', format('Producto %s está congelado', p_sku)
    );
  END IF;

  -- 3. Obtener stock y producto en una sola consulta con JOIN
  SELECT 
    s.id as stock_id, 
    s.disponibles,
    v.nombreProducto,
    v.variante
  INTO stock_record
  FROM stockxbin s
  JOIN variants v ON v.sku = s.sku
  WHERE s.sku = p_sku AND s.bin = p_bin_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'NOT_AVAILABLE',
      'message', format('Producto %s no encontrado en bin %s', p_sku, p_bin_code)
    );
  END IF;

  -- 4. Calcular TTL y disponibilidad real
  SELECT COALESCE((setting_value->>'ttl_minutes')::integer, 30)
  INTO ttl_minutes
  FROM system_settings
  WHERE setting_key = 'free_picking';
  
  cutoff_time := now() - (ttl_minutes || ' minutes')::interval;

  SELECT COALESCE(SUM(pli.quantity), 0)
  INTO total_scanned
  FROM picking_libre_items pli
  JOIN picking_libre_sessions pls ON pli.session_id = pls.id
  WHERE pli.sku = p_sku
    AND pli.bin_code = p_bin_code
    AND pls.status = 'en_proceso'
    AND pls.updated_at >= cutoff_time;

  IF (stock_record.disponibles - total_scanned) < 1 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_STOCK',
      'message', format('Stock insuficiente. Disponible: %s', stock_record.disponibles - total_scanned)
    );
  END IF;

  -- 5. Ejecutar escaneo atómico (INSERT o UPDATE)
  UPDATE picking_libre_items
  SET quantity = quantity + 1, scanned_at = NOW()
  WHERE session_id = p_session_id
    AND sku = p_sku
    AND bin_code = p_bin_code
  RETURNING * INTO item_record;

  IF NOT FOUND THEN
    INSERT INTO picking_libre_items (
      session_id, sku, bin_code, quantity,
      nombre_producto, variante, stock_id, scanned_at
    ) VALUES (
      p_session_id, p_sku, p_bin_code, 1,
      stock_record.nombreProducto, stock_record.variante, stock_record.stock_id, NOW()
    )
    RETURNING * INTO item_record;
  END IF;

  -- 6. Touch sesión (los triggers actualizarán totales automáticamente)
  UPDATE picking_libre_sessions
  SET updated_at = NOW()
  WHERE id = p_session_id;

  -- 7. Retornar el ítem completo para actualización en memoria
  RETURN jsonb_build_object(
    'success', true,
    'item', jsonb_build_object(
      'id', item_record.id,
      'sku', item_record.sku,
      'binCode', item_record.bin_code,
      'quantity', item_record.quantity,
      'productName', item_record.nombre_producto,
      'variante', item_record.variante,
      'scannedAt', item_record.scanned_at,
      'stockId', item_record.stock_id
    )
  );
END;
$$;

-- Otorgar permisos de ejecución
GRANT EXECUTE ON FUNCTION scan_product_unified TO authenticated;

-- Comentario para documentación
COMMENT ON FUNCTION scan_product_unified IS 'RPC unificado que valida, verifica stock y escanea producto en una sola operación atómica. Usa auth.uid() para validación de seguridad.';