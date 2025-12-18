-- =====================================================
-- FIX CRÍTICO: Corregir trigger calculate_en_existencia
-- =====================================================
-- PROBLEMA: El trigger recalcula en_existencia incluyendo comprometido
-- Esto sobrescribe el valor correcto que intenta guardar consume_picking_libre_stock_strict
--
-- ANTES: en_existencia = disponibles + comprometido + reservado
-- AHORA:  en_existencia = disponibles + reservado
--
-- RAZÓN: El stock comprometido YA SALIÓ físicamente del almacén

-- 1. Eliminar trigger existente
DROP TRIGGER IF EXISTS trigger_calculate_en_existencia ON stockxbin;

-- 2. Eliminar función existente
DROP FUNCTION IF EXISTS calculate_en_existencia();

-- 3. Crear función corregida (SIN comprometido)
CREATE OR REPLACE FUNCTION calculate_en_existencia()
RETURNS TRIGGER AS $$
BEGIN
    -- Fórmula correcta: en_existencia = disponibles + reservado
    -- NO incluir comprometido porque ya salió del almacén
    NEW.en_existencia = COALESCE(NEW.disponibles, 0) + COALESCE(NEW.reservado, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Recrear trigger con función corregida
CREATE TRIGGER trigger_calculate_en_existencia
  BEFORE INSERT OR UPDATE ON stockxbin
  FOR EACH ROW
  EXECUTE FUNCTION calculate_en_existencia();

COMMENT ON FUNCTION calculate_en_existencia() IS 
'FASE 5 CORRECCIÓN FINAL: Calcula en_existencia = disponibles + reservado.
NO incluye comprometido porque ese stock ya salió físicamente del almacén cuando se emitió el documento.';

-- Log de corrección
DO $$ 
BEGIN 
  RAISE NOTICE '========================================';
  RAISE NOTICE '🔧 TRIGGER CORREGIDO';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Función: calculate_en_existencia()';
  RAISE NOTICE 'Antes: en_existencia = disponibles + comprometido + reservado';
  RAISE NOTICE 'Ahora:  en_existencia = disponibles + reservado';
  RAISE NOTICE '';
  RAISE NOTICE 'Esto permite que en_existencia refleje correctamente';
  RAISE NOTICE 'el stock FÍSICO en almacén (sin incluir lo ya enviado)';
  RAISE NOTICE '========================================';
END $$;