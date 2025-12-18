
-- =====================================================
-- FIX: Corregir constraint check_reservado_valid
-- =====================================================
-- El constraint anterior impedía reservar stock porque
-- validaba reservado <= disponibles, pero cuando reservamos
-- sacamos de disponibles, causando la violación.

-- Eliminar el constraint mal diseñado
ALTER TABLE stockxbin DROP CONSTRAINT IF EXISTS check_reservado_valid;

-- Agregar constraint correcto (solo validar que reservado >= 0)
ALTER TABLE stockxbin ADD CONSTRAINT check_reservado_valid 
  CHECK (reservado >= 0);

-- Agregar constraint para validar consistencia total del stock
ALTER TABLE stockxbin ADD CONSTRAINT check_stock_consistency 
  CHECK (en_existencia >= COALESCE(disponibles, 0) + COALESCE(reservado, 0) + COALESCE(comprometido, 0));

-- Log de corrección
DO $$
BEGIN
  RAISE LOG '[MIGRATION] Constraint check_reservado_valid corregido - ahora permite reservado independiente de disponibles';
END $$;
