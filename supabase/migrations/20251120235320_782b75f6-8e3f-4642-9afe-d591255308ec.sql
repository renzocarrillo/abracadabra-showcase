
-- =====================================================
-- CLEANUP: Limpiar sesión fallida reciente y corregir stock inconsistente
-- =====================================================

-- 1. Marcar la sesión reciente como error
UPDATE picking_libre_sessions
SET 
  status = 'error',
  last_error = 'Error de trigger - en_existencia no incluía reservado. Sistema corregido.',
  updated_at = NOW()
WHERE id = '8f26c16f-5ed3-4191-8a28-a6245659e878';

-- 2. Recalcular en_existencia para todos los registros con el nuevo cálculo correcto
UPDATE stockxbin
SET en_existencia = disponibles + COALESCE(reservado, 0) + comprometido
WHERE en_existencia != (disponibles + COALESCE(reservado, 0) + comprometido);

-- 3. Log
DO $$
DECLARE
  v_fixed_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_fixed_count
  FROM stockxbin
  WHERE en_existencia = disponibles + COALESCE(reservado, 0) + comprometido;
  
  RAISE LOG '[MIGRATION] Stock corregido - % registros con en_existencia recalculado correctamente', v_fixed_count;
END $$;
