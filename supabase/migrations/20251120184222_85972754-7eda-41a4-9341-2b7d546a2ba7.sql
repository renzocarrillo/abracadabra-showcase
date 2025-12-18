-- ============================================
-- FIX: Agregar 'completed' al constraint de picking_libre_emissions.status
-- ============================================
-- PROBLEMA: El edge function intenta actualizar status a 'completed'
-- pero el constraint solo permite ['pending', 'success', 'failed']
-- SOLUCIÓN: Agregar 'completed' como estado válido

-- 1. Eliminar el constraint existente
ALTER TABLE public.picking_libre_emissions 
DROP CONSTRAINT IF EXISTS picking_libre_emissions_status_check;

-- 2. Agregar nuevo constraint con 'completed' incluido
ALTER TABLE public.picking_libre_emissions 
ADD CONSTRAINT picking_libre_emissions_status_check 
CHECK (status IN ('pending', 'success', 'failed', 'completed'));

-- Verificar que no hay valores inválidos antes de aplicar el constraint
DO $$
DECLARE
  invalid_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM public.picking_libre_emissions
  WHERE status NOT IN ('pending', 'success', 'failed', 'completed');
  
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Hay % registros con status inválido. Limpiarlos antes de aplicar el constraint.', invalid_count;
  END IF;
END $$;