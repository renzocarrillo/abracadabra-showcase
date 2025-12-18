
-- =====================================================
-- FASE 6: VALIDACIÓN DE ELIMINACIÓN
-- Sincronización automática de contadores al eliminar items
-- =====================================================

-- 1. Agregar constraints para prevenir contadores negativos
-- =====================================================

ALTER TABLE picking_libre_sessions
DROP CONSTRAINT IF EXISTS check_total_items_non_negative;

ALTER TABLE picking_libre_sessions
DROP CONSTRAINT IF EXISTS check_unique_products_non_negative;

ALTER TABLE picking_libre_sessions
ADD CONSTRAINT check_total_items_non_negative CHECK (total_items >= 0);

ALTER TABLE picking_libre_sessions
ADD CONSTRAINT check_unique_products_non_negative CHECK (unique_products >= 0);

COMMENT ON CONSTRAINT check_total_items_non_negative ON picking_libre_sessions IS 
'Ensures total_items counter never becomes negative during item deletions';

COMMENT ON CONSTRAINT check_unique_products_non_negative ON picking_libre_sessions IS 
'Ensures unique_products counter never becomes negative during item deletions';


-- 2. Función para sincronizar contadores automáticamente
-- =====================================================

CREATE OR REPLACE FUNCTION auto_sync_session_counters()
RETURNS TRIGGER AS $$
DECLARE
  v_session_id UUID;
BEGIN
  -- Determinar el session_id afectado
  v_session_id := COALESCE(NEW.session_id, OLD.session_id);
  
  -- Solo actualizar si hay un session_id válido
  IF v_session_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Recalcular contadores basándose en los items actuales
  UPDATE picking_libre_sessions
  SET 
    total_items = (
      SELECT COALESCE(SUM(quantity), 0) 
      FROM picking_libre_items 
      WHERE session_id = v_session_id
    ),
    unique_products = (
      SELECT COUNT(DISTINCT sku) 
      FROM picking_libre_items 
      WHERE session_id = v_session_id
    ),
    updated_at = now()
  WHERE id = v_session_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION auto_sync_session_counters() IS 
'Automatically recalculates session counters whenever items are inserted, updated, or deleted';


-- 3. Crear trigger para sincronización automática
-- =====================================================

DROP TRIGGER IF EXISTS trigger_sync_counters_on_item_change ON picking_libre_items;

CREATE TRIGGER trigger_sync_counters_on_item_change
AFTER INSERT OR UPDATE OR DELETE ON picking_libre_items
FOR EACH ROW
EXECUTE FUNCTION auto_sync_session_counters();

COMMENT ON TRIGGER trigger_sync_counters_on_item_change ON picking_libre_items IS 
'Triggers automatic counter synchronization on any item change';


-- 4. Función de testing para validar consistencia
-- =====================================================

CREATE OR REPLACE FUNCTION test_item_removal_consistency()
RETURNS TABLE(
  test_name TEXT,
  passed BOOLEAN,
  details TEXT
) AS $$
DECLARE
  v_session_id UUID;
  v_item_id_to_delete UUID;
  v_initial_total INT;
  v_initial_unique INT;
  v_after_deletion_total INT;
  v_after_deletion_unique INT;
  v_after_decrease_total INT;
  v_item_id_to_decrease UUID;
BEGIN
  -- ==================================================
  -- TEST 1: Eliminar item debe reducir contadores
  -- ==================================================
  
  -- Crear sesión de prueba
  INSERT INTO picking_libre_sessions (
    created_by,
    created_by_name,
    status,
    total_items,
    unique_products
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    'Test User - Removal',
    'en_proceso',
    0,  -- Se calculará automáticamente
    0   -- Se calculará automáticamente
  ) RETURNING id INTO v_session_id;

  -- Agregar items de prueba
  INSERT INTO picking_libre_items (session_id, sku, bin_code, quantity, nombre_producto)
  VALUES 
    (v_session_id, 'TEST-SKU-001', 'TEST-BIN-001', 5, 'Test Product 1'),
    (v_session_id, 'TEST-SKU-002', 'TEST-BIN-002', 3, 'Test Product 2'),
    (v_session_id, 'TEST-SKU-003', 'TEST-BIN-003', 2, 'Test Product 3');

  -- Obtener el último item insertado para eliminarlo
  SELECT id INTO v_item_id_to_delete
  FROM picking_libre_items
  WHERE session_id = v_session_id
  ORDER BY scanned_at DESC
  LIMIT 1;

  -- Leer contadores iniciales (después de inserts, trigger debería haberlos actualizado)
  SELECT total_items, unique_products 
  INTO v_initial_total, v_initial_unique
  FROM picking_libre_sessions 
  WHERE id = v_session_id;

  -- Eliminar un item (trigger debería actualizar automáticamente)
  DELETE FROM picking_libre_items WHERE id = v_item_id_to_delete;

  -- Leer contadores después de eliminación
  SELECT total_items, unique_products 
  INTO v_after_deletion_total, v_after_deletion_unique
  FROM picking_libre_sessions 
  WHERE id = v_session_id;

  -- Verificar Test 1
  test_name := 'Item deletion updates counters automatically';
  passed := (v_after_deletion_total = 8 AND v_after_deletion_unique = 2);
  details := format(
    'Initial: %s items, %s unique. After deletion: %s items, %s unique. Expected: 8 items, 2 unique',
    v_initial_total, v_initial_unique, v_after_deletion_total, v_after_deletion_unique
  );
  RETURN NEXT;

  -- ==================================================
  -- TEST 2: Reducir cantidad debe actualizar contadores
  -- ==================================================
  
  -- Obtener un item para reducir su cantidad
  SELECT id INTO v_item_id_to_decrease
  FROM picking_libre_items
  WHERE session_id = v_session_id
  ORDER BY scanned_at ASC
  LIMIT 1;

  -- Reducir cantidad de 5 a 2
  UPDATE picking_libre_items
  SET quantity = 2
  WHERE id = v_item_id_to_decrease;

  -- Leer contadores después de reducción
  SELECT total_items 
  INTO v_after_decrease_total
  FROM picking_libre_sessions 
  WHERE id = v_session_id;

  -- Verificar Test 2
  test_name := 'Item quantity decrease updates total_items';
  passed := (v_after_decrease_total = 5); -- 2 + 3 = 5 (reducimos 3 unidades)
  details := format(
    'After deletion: %s items. After decrease (5->2): %s items. Expected: 5 items',
    v_after_deletion_total, v_after_decrease_total
  );
  RETURN NEXT;

  -- ==================================================
  -- TEST 3: Eliminar todos los items debe dejar contadores en 0
  -- ==================================================
  
  -- Eliminar todos los items
  DELETE FROM picking_libre_items WHERE session_id = v_session_id;

  -- Leer contadores finales
  DECLARE
    v_final_total INT;
    v_final_unique INT;
  BEGIN
    SELECT total_items, unique_products 
    INTO v_final_total, v_final_unique
    FROM picking_libre_sessions 
    WHERE id = v_session_id;

    -- Verificar Test 3
    test_name := 'Deleting all items sets counters to 0';
    passed := (v_final_total = 0 AND v_final_unique = 0);
    details := format(
      'Final: %s items, %s unique. Expected: 0 items, 0 unique',
      v_final_total, v_final_unique
    );
    RETURN NEXT;
  END;

  -- ==================================================
  -- Limpiar sesión de prueba
  -- ==================================================
  DELETE FROM picking_libre_sessions WHERE id = v_session_id;

EXCEPTION
  WHEN OTHERS THEN
    -- En caso de error, retornar información del error
    test_name := 'Test execution error';
    passed := false;
    details := format('Error: %s', SQLERRM);
    RETURN NEXT;
    
    -- Intentar limpiar sesión de prueba
    BEGIN
      DELETE FROM picking_libre_sessions WHERE id = v_session_id;
    EXCEPTION WHEN OTHERS THEN
      -- Ignorar errores en limpieza
    END;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION test_item_removal_consistency() IS 
'Validates that item deletions and quantity changes correctly update session counters via trigger';


-- 5. Función auxiliar para manual sync (fallback)
-- =====================================================

CREATE OR REPLACE FUNCTION sync_session_counters_manual(p_session_id UUID)
RETURNS jsonb AS $$
DECLARE
  v_total_items INT;
  v_unique_products INT;
BEGIN
  -- Calcular contadores actuales desde items
  SELECT 
    COALESCE(SUM(quantity), 0),
    COUNT(DISTINCT sku)
  INTO v_total_items, v_unique_products
  FROM picking_libre_items
  WHERE session_id = p_session_id;

  -- Actualizar sesión
  UPDATE picking_libre_sessions
  SET 
    total_items = v_total_items,
    unique_products = v_unique_products,
    updated_at = now()
  WHERE id = p_session_id;

  -- Retornar resultado
  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'total_items', v_total_items,
    'unique_products', v_unique_products,
    'synced_at', now()
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'session_id', p_session_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION sync_session_counters_manual(UUID) IS 
'Manually synchronizes session counters from items. Use as fallback if trigger fails';
