-- Actualiza scan_product_unified para aceptar el bin actual desde el frontend
-- y evitar el error NO_BIN_SCANNED al escanear el primer producto después de un bin.

DROP FUNCTION IF EXISTS public.scan_product_unified(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.scan_product_unified(
  p_session_id UUID,
  p_scanned_code TEXT,
  p_bin_code TEXT DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_session RECORD;
  v_variant RECORD;
  v_stock RECORD;
  v_existing_item RECORD;
  v_last_bin TEXT;
  v_new_item_id UUID;
  v_is_frozen BOOLEAN := FALSE;
BEGIN
  -- 1. Obtener usuario autenticado
  v_user_id := COALESCE(p_user_id::UUID, auth.uid());

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  -- 2. Validar sesión
  SELECT * INTO v_session
  FROM picking_libre_sessions
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_INVALID');
  END IF;

  IF v_session.created_by != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_PERMISSION');
  END IF;

  IF v_session.status NOT IN ('escaneo', 'verificacion', 'en_proceso') THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_CLOSED');
  END IF;

  -- 3. Buscar variante por SKU o código de barras
  SELECT v.id, v.sku, v.variante, COALESCE(v."nombreProducto", p."nombreProducto") as "nombreProducto"
  INTO v_variant
  FROM variants v
  LEFT JOIN "productosBsale" p ON v."idProductoBsale" = p.id
  WHERE v.sku = p_scanned_code
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'PRODUCT_NOT_FOUND', 'scanned_code', p_scanned_code);
  END IF;

  -- 4. Verificar si está congelado
  SELECT EXISTS(
    SELECT 1 FROM productos_congelados WHERE sku = v_variant.sku
  ) INTO v_is_frozen;

  IF v_is_frozen THEN
    RETURN jsonb_build_object('success', false, 'error', 'PRODUCT_FROZEN', 'sku', v_variant.sku);
  END IF;

  -- 5. Determinar el bin efectivo: usar el enviado por el frontend o el último registrado en la sesión
  v_last_bin := COALESCE(
    p_bin_code,
    (
      SELECT bin_code
      FROM picking_libre_items
      WHERE session_id = p_session_id
      ORDER BY scanned_at DESC
      LIMIT 1
    )
  );

  IF v_last_bin IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_BIN_SCANNED');
  END IF;

  -- 6. Buscar stock disponible en ese bin
  SELECT s.id, s.sku, s.bin, s.disponibles, s.en_existencia, s.comprometido, s.reservado
  INTO v_stock
  FROM stockxbin s
  WHERE s.sku = v_variant.sku
    AND s.bin = v_last_bin
    AND s.disponibles > 0
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'NOT_AVAILABLE',
      'sku', v_variant.sku,
      'bin', v_last_bin
    );
  END IF;

  -- 7. Verificar si ya existe un ítem para este SKU+BIN en la sesión
  SELECT * INTO v_existing_item
  FROM picking_libre_items
  WHERE session_id = p_session_id
    AND sku = v_variant.sku
    AND bin_code = v_last_bin;

  IF FOUND THEN
    -- Verificar que haya stock suficiente para incrementar
    IF v_stock.disponibles <= v_existing_item.quantity THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'INSUFFICIENT_STOCK',
        'sku', v_variant.sku,
        'bin', v_last_bin,
        'available', v_stock.disponibles,
        'current_quantity', v_existing_item.quantity
      );
    END IF;

    -- Incrementar cantidad
    UPDATE picking_libre_items
    SET quantity = quantity + 1,
        scanned_at = NOW()
    WHERE id = v_existing_item.id;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'incremented',
      'item_id', v_existing_item.id,
      'sku', v_variant.sku,
      'bin_code', v_last_bin,
      'nombre_producto', v_variant."nombreProducto",
      'variante', v_variant.variante,
      'new_quantity', v_existing_item.quantity + 1,
      'stock_id', v_stock.id
    );
  ELSE
    -- Crear nuevo ítem
    INSERT INTO picking_libre_items (
      session_id, sku, bin_code, quantity, nombre_producto, variante, stock_id, scanned_at
    ) VALUES (
      p_session_id, v_variant.sku, v_last_bin, 1, v_variant."nombreProducto", v_variant.variante, v_stock.id, NOW()
    )
    RETURNING id INTO v_new_item_id;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'created',
      'item_id', v_new_item_id,
      'sku', v_variant.sku,
      'bin_code', v_last_bin,
      'nombre_producto', v_variant."nombreProducto",
      'variante', v_variant.variante,
      'quantity', 1,
      'stock_id', v_stock.id
    );
  END IF;
END;
$$;

-- Comentario explicativo
COMMENT ON FUNCTION public.scan_product_unified IS
'Función unificada para escanear productos en picking libre.
Parámetros:
- p_session_id: UUID de la sesión de picking
- p_scanned_code: SKU del producto escaneado
- p_bin_code: bin actual enviado por el frontend (fallback al último bin registrado en la sesión)
- p_user_id: (opcional) ID del usuario, usa auth.uid() si no se proporciona

La función obtiene el bin efectivo usando el parámetro o el último ítem escaneado en la sesión.';