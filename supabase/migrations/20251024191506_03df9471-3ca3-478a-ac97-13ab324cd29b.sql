-- Drop existing restrictive policy
DROP POLICY IF EXISTS "Authorized users can manage picking libre sessions" ON picking_libre_sessions;

-- Allow all users except store managers to create their own sessions
CREATE POLICY "Users can create their own picking sessions"
ON picking_libre_sessions
FOR INSERT
WITH CHECK (
  created_by = auth.uid() 
  AND EXISTS (
    SELECT 1
    FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid() 
    AND ut.name <> 'cabeza_de_tienda'
  )
);

-- Allow users to update their own sessions
CREATE POLICY "Users can update their own sessions"
ON picking_libre_sessions
FOR UPDATE
USING (
  created_by = auth.uid() 
  OR user_has_role('admin'::text)
)
WITH CHECK (
  created_by = auth.uid() 
  OR user_has_role('admin'::text)
);

-- Allow users to delete their own sessions
CREATE POLICY "Users can delete their own sessions"
ON picking_libre_sessions
FOR DELETE
USING (
  created_by = auth.uid() 
  OR user_has_role('admin'::text)
);