-- Allow cabeza_de_tienda to read completed picking libre sessions for verification
CREATE POLICY "Store managers can read completed sessions for verification"
ON public.picking_libre_sessions
FOR SELECT
TO authenticated
USING (
  status = 'completado' 
  AND EXISTS (
    SELECT 1 FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid() 
    AND ut.name = 'cabeza_de_tienda'
  )
);

-- Allow cabeza_de_tienda to read items from completed picking libre sessions
CREATE POLICY "Store managers can read items from completed sessions"
ON public.picking_libre_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM picking_libre_sessions pls
    WHERE pls.id = picking_libre_items.session_id
    AND pls.status = 'completado'
  )
  AND EXISTS (
    SELECT 1 FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid() 
    AND ut.name = 'cabeza_de_tienda'
  )
);

-- Create specific permission for transfer verification
INSERT INTO permissions (name, display_name, description, category)
VALUES ('verify_transfer_reception', 'Verificar Recepción de Traslados', 
        'Verificar productos recibidos de traslados completados', 'transfers')
ON CONFLICT (name) DO NOTHING;

-- Assign permission to cabeza_de_tienda user type
INSERT INTO user_type_permissions (user_type_id, permission_id)
SELECT ut.id, p.id
FROM user_types ut, permissions p
WHERE ut.name = 'cabeza_de_tienda' 
AND p.name = 'verify_transfer_reception'
ON CONFLICT DO NOTHING;