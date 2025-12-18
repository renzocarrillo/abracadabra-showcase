-- Actualizar política de visibilidad de perfiles para permitir que todos los usuarios autenticados
-- puedan ver información básica de otros usuarios (nombre completo)

-- Eliminar la política restrictiva actual
DROP POLICY IF EXISTS "Profiles visibility" ON public.profiles;

-- Crear nueva política que permite a todos los usuarios autenticados ver perfiles básicos
CREATE POLICY "All authenticated users can view profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  -- Todos los usuarios autenticados pueden ver perfiles que no han sido eliminados
  deleted_at IS NULL
);