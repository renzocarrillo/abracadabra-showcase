-- Enable RLS on payment_types table
ALTER TABLE public.payment_types ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to read payment types
CREATE POLICY "Usuarios autenticados pueden leer payment_types"
ON public.payment_types
FOR SELECT
TO authenticated
USING (true);