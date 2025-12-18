-- Actualizar políticas RLS para order_signatures
-- Permitir que usuarios con permisos puedan crear firmas usando PINs de otros usuarios

-- Eliminar política existente si existe
DROP POLICY IF EXISTS "Users can insert their own signatures" ON public.order_signatures;
DROP POLICY IF EXISTS "Authorized users can create signatures" ON public.order_signatures;

-- Crear nueva política para INSERT
-- Permite que cualquier usuario autenticado con permisos de firmar pueda insertar firmas
-- El signed_by puede ser diferente de auth.uid() porque el PIN ya fue validado
CREATE POLICY "Authorized users can create signatures with PIN" 
ON public.order_signatures 
FOR INSERT 
TO authenticated
WITH CHECK (
  -- El usuario actual debe tener permisos para firmar
  can_sign_orders()
);

-- Actualizar política de SELECT para que todos puedan ver las firmas
DROP POLICY IF EXISTS "Users can view all signatures" ON public.order_signatures;
DROP POLICY IF EXISTS "Anyone can view signatures" ON public.order_signatures;

CREATE POLICY "Authenticated users can view signatures" 
ON public.order_signatures 
FOR SELECT 
TO authenticated
USING (true);