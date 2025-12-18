-- =====================================================
-- FIX CRÍTICO: Corregir constraint check_stock_consistency
-- =====================================================
-- PROBLEMA: El constraint actual impide que en_existencia baje cuando
-- se consume stock porque requiere que en_existencia >= disponibles + reservado + comprometido
-- 
-- Cuando consumimos:
-- - disponibles: 39 (sin cambio)
-- - reservado: 1 → 0 (baja 1)
-- - comprometido: 0 → 1 (sube 1)
-- - Suma: 40 (sin cambio)
-- - en_existencia: 40 → 39 (baja 1) ← VIOLA CONSTRAINT (39 < 40)
--
-- SOLUCIÓN: en_existencia debe ser >= disponibles + reservado
-- (NO incluimos comprometido porque ya salió físicamente del almacén)

-- 1. Eliminar constraint incorrecto
ALTER TABLE stockxbin DROP CONSTRAINT IF EXISTS check_stock_consistency;

-- 2. Crear constraint correcto
ALTER TABLE stockxbin ADD CONSTRAINT check_stock_consistency 
  CHECK (
    en_existencia >= (COALESCE(disponibles, 0) + COALESCE(reservado, 0))
  );

-- 3. Validar que los datos actuales cumplen con el nuevo constraint
DO $$
DECLARE
  v_violations INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_violations
  FROM stockxbin
  WHERE en_existencia < (COALESCE(disponibles, 0) + COALESCE(reservado, 0));
  
  IF v_violations > 0 THEN
    RAISE EXCEPTION 'Existen % registros que violan el nuevo constraint', v_violations;
  END IF;
  
  RAISE NOTICE '✅ Constraint corregido - 0 violaciones detectadas';
END $$;

COMMENT ON CONSTRAINT check_stock_consistency ON stockxbin IS 
'FASE 5 CORRECCIÓN: en_existencia debe ser al menos la suma de disponibles + reservado.
El stock comprometido NO se incluye porque ya salió físicamente del almacén cuando se emitió el documento.';

-- Log de corrección
DO $$ 
BEGIN 
  RAISE NOTICE '========================================';
  RAISE NOTICE '🔧 CONSTRAINT CORREGIDO';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Antes: en_existencia >= disponibles + reservado + comprometido';
  RAISE NOTICE 'Ahora:  en_existencia >= disponibles + reservado';
  RAISE NOTICE '';
  RAISE NOTICE 'Esto permite que en_existencia baje correctamente cuando';
  RAISE NOTICE 'consume_picking_libre_stock_strict mueve stock a comprometido';
  RAISE NOTICE '========================================';
END $$;