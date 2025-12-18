-- Eliminar políticas duplicadas y reorganizar
DROP POLICY IF EXISTS "Supervisors can view non-admin profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile only" ON public.profiles;

-- Las políticas que quedan ahora son:
-- 1. "Admins and supervisors can view all profiles including deleted" (recién creada)
-- 2. "Admins can update any profile" 
-- 3. "Users can update own profile only"