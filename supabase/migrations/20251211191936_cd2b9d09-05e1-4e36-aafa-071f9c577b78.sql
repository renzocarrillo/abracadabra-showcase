-- =====================================================
-- PROTECCIÓN DE STOCK EN TIEMPO REAL PARA PICKING LIBRE
-- =====================================================
-- NUEVO FLUJO:
--   ESCANEO: disponibles → comprometido (protege stock inmediatamente)
--   EDITAR/ELIMINAR: comprometido → disponibles (libera stock)
--   EMITIR ÉXITO: comprometido → 0 (sale del inventario)
--   CANCELAR: comprometido → disponibles (libera todo)
-- =====================================================

-- 1. MODIFICAR scan_product_unified para mover stock a comprometido al escanear
DROP FUNCTION IF EXISTS public.scan_product_unified(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.scan_product_unified(UUID, TEXT, TEXT, TEXT);

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

  -- 5. Determinar el bin efectivo
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

  -- 6. Buscar stock disponible en ese bin CON LOCK para evitar race conditions
  SELECT s.id, s.sku, s.bin, s.disponibles, s.en_existencia, s.comprometido, s.reservado
  INTO v_stock
  FROM stockxbin s
  WHERE s.sku = v_variant.sku
    AND s.bin = v_last_bin
    AND s.disponibles > 0
  FOR UPDATE NOWAIT;

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
    IF v_stock.disponibles <= 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'INSUFFICIENT_STOCK',
        'sku', v_variant.sku,
        'bin', v_last_bin,
        'available', v_stock.disponibles,
        'current_quantity', v_existing_item.quantity
      );
    END IF;

    -- NUEVO: Mover 1 unidad de disponibles → comprometido
    UPDATE stockxbin
    SET 
      disponibles = disponibles - 1,
      comprometido = comprometido + 1,
      updated_at = NOW()
    WHERE id = v_stock.id
      AND disponibles >= 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'STOCK_RACE_CONDITION',
        'message', 'El stock fue tomado por otro proceso'
      );
    END IF;

    -- Incrementar cantidad en el item
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
    -- NUEVO: Mover 1 unidad de disponibles → comprometido (primer escaneo)
    UPDATE stockxbin
    SET 
      disponibles = disponibles - 1,
      comprometido = comprometido + 1,
      updated_at = NOW()
    WHERE id = v_stock.id
      AND disponibles >= 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'STOCK_RACE_CONDITION',
        'message', 'El stock fue tomado por otro proceso'
      );
    END IF;

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

EXCEPTION
  WHEN lock_not_available THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'STOCK_LOCKED',
      'message', 'El stock está siendo procesado por otro usuario'
    );
END;
$$;

COMMENT ON FUNCTION public.scan_product_unified IS
'Función unificada para escanear productos en picking libre CON PROTECCIÓN DE STOCK.
Al escanear, mueve 1 unidad de disponibles → comprometido para proteger el stock.
Usa FOR UPDATE NOWAIT para prevenir race conditions entre pickers.';

-- 2. MODIFICAR decrement_picking_item_quantity para devolver stock a disponibles
DROP FUNCTION IF EXISTS decrement_picking_item_quantity(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION decrement_picking_item_quantity(
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
  v_current_quantity INTEGER;
  v_stock_id UUID;
BEGIN
  -- Obtener cantidad actual y stock_id
  SELECT quantity, stock_id INTO v_current_quantity, v_stock_id
  FROM picking_libre_items
  WHERE session_id = p_session_id
    AND sku = p_sku
    AND bin_code = p_bin_code;

  -- Si no existe, salir
  IF v_current_quantity IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ITEM_NOT_FOUND');
  END IF;

  -- NUEVO: Devolver 1 unidad de comprometido → disponibles
  UPDATE stockxbin
  SET 
    comprometido = comprometido - 1,
    disponibles = disponibles + 1,
    updated_at = NOW()
  WHERE id = v_stock_id
    AND comprometido >= 1;

  -- Si es 1, eliminar el registro
  IF v_current_quantity <= 1 THEN
    DELETE FROM picking_libre_items
    WHERE session_id = p_session_id
      AND sku = p_sku
      AND bin_code = p_bin_code;
    
    RETURN jsonb_build_object('success', true, 'action', 'deleted');
  ELSE
    -- Si es mayor a 1, decrementar
    UPDATE picking_libre_items
    SET quantity = quantity - 1
    WHERE session_id = p_session_id
      AND sku = p_sku
      AND bin_code = p_bin_code;
    
    RETURN jsonb_build_object('success', true, 'action', 'decremented', 'new_quantity', v_current_quantity - 1);
  END IF;
END;
$$;

COMMENT ON FUNCTION decrement_picking_item_quantity IS
'Decrementa cantidad de un item en picking libre y devuelve stock de comprometido → disponibles.';

-- 3. CREAR función remove_picking_libre_item para eliminar items completos
CREATE OR REPLACE FUNCTION remove_picking_libre_item(
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
  v_item RECORD;
BEGIN
  -- Obtener item a eliminar
  SELECT quantity, stock_id INTO v_item
  FROM picking_libre_items
  WHERE session_id = p_session_id
    AND sku = p_sku
    AND bin_code = p_bin_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ITEM_NOT_FOUND');
  END IF;

  -- Devolver TODO el stock de comprometido → disponibles
  UPDATE stockxbin
  SET 
    comprometido = comprometido - v_item.quantity,
    disponibles = disponibles + v_item.quantity,
    updated_at = NOW()
  WHERE id = v_item.stock_id
    AND comprometido >= v_item.quantity;

  -- Eliminar el item
  DELETE FROM picking_libre_items
  WHERE session_id = p_session_id
    AND sku = p_sku
    AND bin_code = p_bin_code;

  RETURN jsonb_build_object(
    'success', true, 
    'released_quantity', v_item.quantity,
    'stock_id', v_item.stock_id
  );
END;
$$;

COMMENT ON FUNCTION remove_picking_libre_item IS
'Elimina un item completo de picking libre y devuelve todo su stock de comprometido → disponibles.';

-- 4. MODIFICAR cancel_picking_session para liberar stock comprometido
DROP FUNCTION IF EXISTS cancel_picking_session(UUID);

CREATE OR REPLACE FUNCTION cancel_picking_session(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_items_released INTEGER := 0;
BEGIN
  -- Verificar sesión
  SELECT * INTO v_session
  FROM picking_libre_sessions
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND');
  END IF;

  -- Solo cancelar si está en proceso
  IF v_session.status NOT IN ('en_proceso', 'escaneo', 'verificacion', 'verificado', 'emitiendo') THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_ALREADY_CLOSED');
  END IF;

  -- NUEVO: Liberar stock comprometido → disponibles
  UPDATE stockxbin s
  SET 
    comprometido = s.comprometido - consolidated.total_quantity,
    disponibles = s.disponibles + consolidated.total_quantity,
    updated_at = NOW()
  FROM (
    SELECT 
      stock_id,
      SUM(quantity) as total_quantity
    FROM picking_libre_items
    WHERE session_id = p_session_id
    GROUP BY stock_id
  ) consolidated
  WHERE s.id = consolidated.stock_id
    AND s.comprometido >= consolidated.total_quantity;

  GET DIAGNOSTICS v_items_released = ROW_COUNT;

  -- Marcar sesión como cancelada
  UPDATE picking_libre_sessions
  SET 
    status = 'cancelado',
    updated_at = NOW()
  WHERE id = p_session_id;

  -- Log de auditoría
  INSERT INTO picking_libre_audit_log (
    session_id,
    event_type,
    event_status,
    details
  ) VALUES (
    p_session_id,
    'SESSION_CANCELLED_WITH_STOCK_RELEASE',
    'success',
    jsonb_build_object(
      'items_released', v_items_released,
      'timestamp', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', true, 
    'items_released', v_items_released
  );
END;
$$;

COMMENT ON FUNCTION cancel_picking_session IS
'Cancela una sesión de picking libre y libera todo el stock comprometido → disponibles.';

-- 5. MODIFICAR consume_picking_libre_stock_strict para consumir desde comprometido
DROP FUNCTION IF EXISTS consume_picking_libre_stock_strict(uuid, integer);

CREATE OR REPLACE FUNCTION consume_picking_libre_stock_strict(
  p_session_id uuid,
  p_expected_version integer DEFAULT NULL
)
RETURNS TABLE(
  success boolean,
  items_updated integer,
  error_message text,
  new_version integer
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated INTEGER := 0;
  v_session RECORD;
  v_new_version INTEGER;
  v_stock_id UUID;
  v_total_quantity INTEGER;
BEGIN
  RAISE LOG '[CONSUME_FROM_COMPROMETIDO] ============================================';
  RAISE LOG '[CONSUME_FROM_COMPROMETIDO] INICIO - Session: %', p_session_id;

  -- 1. Obtener sesión con lock
  SELECT * INTO v_session
  FROM picking_libre_sessions
  WHERE id = p_session_id
  FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    RAISE LOG '[CONSUME_FROM_COMPROMETIDO] ERROR: Sesión no encontrada';
    RETURN QUERY SELECT false, 0, 'Sesión no encontrada'::TEXT, 0;
    RETURN;
  END IF;

  RAISE LOG '[CONSUME_FROM_COMPROMETIDO] Sesión encontrada - Status: %, Version: %', 
    v_session.status, v_session.data_version;

  -- 2. Validar versión (optimistic locking)
  IF p_expected_version IS NOT NULL AND v_session.data_version != p_expected_version THEN
    RAISE LOG '[CONSUME_FROM_COMPROMETIDO] ERROR: Version mismatch - Esperada: %, Actual: %', 
      p_expected_version, v_session.data_version;
    RETURN QUERY SELECT 
      false, 
      0, 
      format('VERSION_MISMATCH: Esperada %s, Actual %s', p_expected_version, v_session.data_version)::TEXT,
      v_session.data_version;
    RETURN;
  END IF;

  -- 3. Lock explícito de rows de stockxbin ANTES de validaciones
  FOR v_stock_id IN
    SELECT DISTINCT stock_id
    FROM picking_libre_items
    WHERE session_id = p_session_id
  LOOP
    PERFORM 1
    FROM stockxbin
    WHERE id = v_stock_id
    FOR UPDATE NOWAIT;
  END LOOP;

  RAISE LOG '[CONSUME_FROM_COMPROMETIDO] Locks adquiridos exitosamente';

  -- 4. Validar que todo el stock esté en comprometido
  FOR v_stock_id, v_total_quantity IN
    SELECT 
      stock_id,
      SUM(quantity) as total_qty
    FROM picking_libre_items
    WHERE session_id = p_session_id
    GROUP BY stock_id
  LOOP
    DECLARE
      v_comprometido INTEGER;
      v_sku TEXT;
      v_bin TEXT;
    BEGIN
      SELECT comprometido, sku, bin 
      INTO v_comprometido, v_sku, v_bin
      FROM stockxbin
      WHERE id = v_stock_id;

      RAISE LOG '[CONSUME_FROM_COMPROMETIDO] Validando stock_id: % - SKU: %, Bin: %, Comprometido: %, Necesario: %',
        v_stock_id, v_sku, v_bin, v_comprometido, v_total_quantity;

      IF v_comprometido < v_total_quantity THEN
        RAISE LOG '[CONSUME_FROM_COMPROMETIDO] ERROR: Stock comprometido insuficiente';
        RETURN QUERY SELECT 
          false,
          0,
          format('Stock comprometido insuficiente para SKU %s en bin %s. Comprometido: %s, Necesario: %s', 
                 v_sku, v_bin, v_comprometido, v_total_quantity)::TEXT,
          v_session.data_version;
        RETURN;
      END IF;
    END;
  END LOOP;

  RAISE LOG '[CONSUME_FROM_COMPROMETIDO] Validación OK - Consumiendo stock...';

  -- 5. CONSUMIR STOCK: comprometido → 0 (salida definitiva)
  -- El trigger calculate_en_existencia recalculará automáticamente en_existencia
  UPDATE stockxbin s
  SET 
    comprometido = comprometido - consolidated.total_quantity,
    updated_at = now()
  FROM (
    SELECT 
      stock_id, 
      SUM(quantity) as total_quantity
    FROM picking_libre_items
    WHERE session_id = p_session_id
    GROUP BY stock_id
  ) consolidated
  WHERE s.id = consolidated.stock_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RAISE LOG '[CONSUME_FROM_COMPROMETIDO] Stock consumido - Rows actualizados: %', v_updated;

  -- 6. Actualizar versión de sesión
  v_new_version := v_session.data_version + 1;
  
  UPDATE picking_libre_sessions
  SET 
    data_version = v_new_version,
    status = 'completado',
    completed_at = now(),
    updated_at = now()
  WHERE id = p_session_id;

  -- 7. Log de auditoría
  INSERT INTO picking_libre_audit_log (
    session_id,
    event_type,
    event_status,
    details
  ) VALUES (
    p_session_id,
    'STOCK_CONSUMED_FROM_COMPROMETIDO',
    'success',
    jsonb_build_object(
      'items_updated', v_updated,
      'version', v_new_version,
      'method', 'comprometido_to_zero',
      'timestamp', now()
    )
  );

  RAISE LOG '[CONSUME_FROM_COMPROMETIDO] ============================================';
  RAISE LOG '[CONSUME_FROM_COMPROMETIDO] COMPLETADO - Items: %, Nueva version: %', v_updated, v_new_version;

  RETURN QUERY SELECT true, v_updated, NULL::TEXT, v_new_version;
  
EXCEPTION
  WHEN lock_not_available THEN
    RAISE LOG '[CONSUME_FROM_COMPROMETIDO] ERROR: Stock bloqueado';
    RETURN QUERY SELECT 
      false,
      0,
      'Stock bloqueado por otra operación. Intente nuevamente.'::TEXT,
      v_session.data_version;
  WHEN OTHERS THEN
    RAISE LOG '[CONSUME_FROM_COMPROMETIDO] EXCEPTION: % - %', SQLERRM, SQLSTATE;
    RETURN QUERY SELECT 
      false,
      0,
      format('Error al consumir stock: %s', SQLERRM)::TEXT,
      COALESCE(v_session.data_version, 0);
END;
$$;

COMMENT ON FUNCTION consume_picking_libre_stock_strict IS 
'Consume stock de Picking Libre desde COMPROMETIDO → 0.
El stock ya está protegido en comprometido desde el momento del escaneo.
NO usa reservado (sistema anterior). El trigger recalcula en_existencia.';

-- 6. Log final
DO $$ 
BEGIN 
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ PROTECCIÓN DE STOCK EN TIEMPO REAL IMPLEMENTADA';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'NUEVO FLUJO PICKING LIBRE:';
  RAISE NOTICE '  1. ESCANEAR: disponibles → comprometido (protege stock)';
  RAISE NOTICE '  2. EDITAR/ELIMINAR: comprometido → disponibles (libera)';
  RAISE NOTICE '  3. EMITIR ÉXITO: comprometido → 0 (salida)';
  RAISE NOTICE '  4. CANCELAR: comprometido → disponibles (libera todo)';
  RAISE NOTICE '';
  RAISE NOTICE 'BENEFICIOS:';
  RAISE NOTICE '  • Stock protegido desde el escaneo';
  RAISE NOTICE '  • Múltiples pickers no pueden tomar mismo producto';
  RAISE NOTICE '  • Ediciones liberan stock correctamente';
  RAISE NOTICE '========================================';
END $$;