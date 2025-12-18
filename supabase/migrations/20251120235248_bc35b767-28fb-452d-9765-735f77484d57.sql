
-- =====================================================
-- FIX CRÍTICO: Actualizar validate_stock_values para incluir reservado
-- =====================================================

DROP FUNCTION IF EXISTS public.validate_stock_values() CASCADE;

CREATE OR REPLACE FUNCTION public.validate_stock_values()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Ensure no negative values
    NEW.disponibles := GREATEST(0, COALESCE(NEW.disponibles, 0));
    NEW.comprometido := GREATEST(0, COALESCE(NEW.comprometido, 0));
    NEW.reservado := GREATEST(0, COALESCE(NEW.reservado, 0));
    
    -- Recalcular en_existencia INCLUYENDO reservado
    NEW.en_existencia := NEW.disponibles + NEW.comprometido + NEW.reservado;
    
    -- Update timestamp
    NEW.updated_at := now();
    
    RETURN NEW;
END;
$$;

-- Recrear el trigger
DROP TRIGGER IF EXISTS trigger_validate_stock_values ON stockxbin;
CREATE TRIGGER trigger_validate_stock_values
    BEFORE INSERT OR UPDATE ON stockxbin
    FOR EACH ROW
    EXECUTE FUNCTION validate_stock_values();

-- Log de corrección
DO $$
BEGIN
  RAISE LOG '[MIGRATION] Función validate_stock_values actualizada para incluir reservado en cálculo de en_existencia';
END $$;
