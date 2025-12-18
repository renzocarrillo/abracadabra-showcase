-- Agregar políticas RLS para DELETE y UPDATE en picking_libre_items

-- Política para DELETE: usuarios pueden eliminar items de sus propias sesiones activas
CREATE POLICY "Users can delete items from their own sessions"
ON picking_libre_items
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM picking_libre_sessions
    WHERE picking_libre_sessions.id = picking_libre_items.session_id
      AND picking_libre_sessions.created_by = auth.uid()
      AND picking_libre_sessions.status = 'en_proceso'
  )
);

-- Política para UPDATE: usuarios pueden modificar items de sus propias sesiones activas
CREATE POLICY "Users can update items in their own sessions"
ON picking_libre_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM picking_libre_sessions
    WHERE picking_libre_sessions.id = picking_libre_items.session_id
      AND picking_libre_sessions.created_by = auth.uid()
      AND picking_libre_sessions.status = 'en_proceso'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM picking_libre_sessions
    WHERE picking_libre_sessions.id = picking_libre_items.session_id
      AND picking_libre_sessions.created_by = auth.uid()
      AND picking_libre_sessions.status = 'en_proceso'
  )
);