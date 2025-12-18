
-- =====================================================
-- FIX: Actualizar calculate_en_existencia para incluir reservado
-- =====================================================

DROP FUNCTION IF EXISTS public.calculate_en_existencia() CASCADE;

CREATE OR REPLACE FUNCTION public.calculate_en_existencia()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Incluir reservado en el cálculo de en_existencia
    NEW.en_existencia = COALESCE(NEW.disponibles, 0) + COALESCE(NEW.comprometido, 0) + COALESCE(NEW.reservado, 0);
    RETURN NEW;
END;
$$;

-- Recrear el trigger
DROP TRIGGER IF EXISTS trigger_calculate_en_existencia ON stockxbin;
CREATE TRIGGER trigger_calculate_en_existencia
    BEFORE INSERT OR UPDATE ON stockxbin
    FOR EACH ROW
    EXECUTE FUNCTION calculate_en_existencia();

-- Log
DO $$
BEGIN
  RAISE LOG '[MIGRATION] Función calculate_en_existencia actualizada para incluir reservado';
END $$;
