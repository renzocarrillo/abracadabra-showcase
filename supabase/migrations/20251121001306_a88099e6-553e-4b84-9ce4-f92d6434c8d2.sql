-- =====================================================
-- LIMPIEZA: Liberar stock reservado de sesiones en error
-- PROBLEMA: Sesiones fallidas dejaron stock reservado sin liberar
-- SOLUCIÓN: Liberar reservas de sesiones en error y mover a disponibles
-- =====================================================

-- Paso 1: Identificar stock reservado por sesiones en error
DO $$
DECLARE
  v_item RECORD;
  v_released_count INTEGER := 0;
BEGIN
  -- Iterar sobre items de sesiones en error
  FOR v_item IN
    SELECT 
      pli.stock_id,
      pli.sku,
      pli.bin_code,
      SUM(pli.quantity) as total_quantity,
      pls.id as session_id,
      pls.status
    FROM picking_libre_items pli
    INNER JOIN picking_libre_sessions pls ON pls.id = pli.session_id
    WHERE pls.status IN ('error', 'cancelado')
      AND pli.stock_id IS NOT NULL
    GROUP BY pli.stock_id, pli.sku, pli.bin_code, pls.id, pls.status
  LOOP
    -- Liberar stock: mover de reservado a disponibles
    UPDATE stockxbin
    SET 
      reservado = GREATEST(0, reservado - v_item.total_quantity),
      disponibles = disponibles + v_item.total_quantity,
      updated_at = NOW()
    WHERE id = v_item.stock_id
      AND reservado >= v_item.total_quantity;
    
    IF FOUND THEN
      v_released_count := v_released_count + 1;
      
      RAISE LOG '[CLEANUP] Stock liberado: SKU=%, Bin=%, Cantidad=%, Session=%', 
        v_item.sku, v_item.bin_code, v_item.total_quantity, v_item.session_id;
    END IF;
  END LOOP;
  
  RAISE LOG '[CLEANUP] Total items de stock liberados: %', v_released_count;
END $$;

-- Paso 2: Eliminar items de sesiones en error para evitar confusión
DELETE FROM picking_libre_items
WHERE session_id IN (
  SELECT id 
  FROM picking_libre_sessions 
  WHERE status IN ('error', 'cancelado')
);

-- Paso 3: Log final
DO $$
DECLARE
  v_stock_record RECORD;
BEGIN
  RAISE LOG '[CLEANUP] Estado final del stock después de limpieza:';
  
  FOR v_stock_record IN
    SELECT sku, bin, disponibles, reservado, comprometido, en_existencia
    FROM stockxbin
    WHERE sku = '1062228-1' AND bin = 'Transito'
  LOOP
    RAISE LOG '  SKU: %, Bin: %, Disponibles: %, Reservado: %, Comprometido: %, En Existencia: %',
      v_stock_record.sku, 
      v_stock_record.bin, 
      v_stock_record.disponibles, 
      v_stock_record.reservado, 
      v_stock_record.comprometido, 
      v_stock_record.en_existencia;
  END LOOP;
END $$;