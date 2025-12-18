-- ============================================================================
-- FASE 0: CORRECCIONES DE SEGURIDAD
-- ============================================================================

-- Corregir search_path en funciones trigger
CREATE OR REPLACE FUNCTION public.update_session_activity_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.last_activity_at = now();
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Verificar que no falten políticas RLS para feature_flags
-- Ya tiene políticas completas (SELECT para todos, ALL para admins)

-- Verificar que no falten políticas RLS para picking_libre_audit_log  
-- Ya tiene políticas completas (INSERT para todos, SELECT según permisos)

COMMENT ON FUNCTION public.update_session_activity_timestamp IS 'Actualiza automáticamente last_activity_at cuando cambia el estado de una sesión';

-- ============================================================================
-- CONFIRMACIÓN
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Correcciones de seguridad aplicadas';
END $$;