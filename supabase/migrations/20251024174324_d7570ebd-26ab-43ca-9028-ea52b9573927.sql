-- Drop existing restrictive policies and create new ones that allow all users except 'cabeza_de_tienda'

-- =====================================================
-- PICKING LIBRE SESSIONS
-- =====================================================

-- Drop existing read policy for picking_libre_sessions
DROP POLICY IF EXISTS "Users with free_picking can manage sessions" ON picking_libre_sessions;

-- Create new read policy allowing all except cabeza_de_tienda
CREATE POLICY "All users except store managers can read picking libre sessions"
ON picking_libre_sessions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid()
    AND ut.name != 'cabeza_de_tienda'
  )
);

-- Create new management policy (insert, update, delete)
CREATE POLICY "Authorized users can manage picking libre sessions"
ON picking_libre_sessions
FOR ALL
TO authenticated
USING (
  user_has_role('admin'::text) OR 
  user_has_permission('free_picking'::text) OR 
  (auth.uid() = created_by)
)
WITH CHECK (
  user_has_role('admin'::text) OR 
  user_has_permission('free_picking'::text)
);

-- =====================================================
-- PICKING LIBRE ITEMS
-- =====================================================

-- Drop existing read policy for picking_libre_items
DROP POLICY IF EXISTS "Users can read items from their sessions" ON picking_libre_items;

-- Create new read policy allowing all except cabeza_de_tienda
CREATE POLICY "All users except store managers can read picking libre items"
ON picking_libre_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid()
    AND ut.name != 'cabeza_de_tienda'
  )
);

-- =====================================================
-- PEDIDOS (ORDERS)
-- =====================================================

-- Drop existing read policy for pedidos
DROP POLICY IF EXISTS "Authorized users can read orders" ON pedidos;

-- Create new read policy allowing all except cabeza_de_tienda
CREATE POLICY "All users except store managers can read orders"
ON pedidos
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid()
    AND ut.name != 'cabeza_de_tienda'
  )
);

-- =====================================================
-- VENTAS (SALES)
-- =====================================================

-- Drop existing read policies for ventas
DROP POLICY IF EXISTS "Authorized users can read sales" ON ventas;
DROP POLICY IF EXISTS "Pickers and viewers can read sales" ON ventas;

-- Create new comprehensive read policy allowing all except cabeza_de_tienda
CREATE POLICY "All users except store managers can read sales"
ON ventas
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid()
    AND ut.name != 'cabeza_de_tienda'
  )
);

-- =====================================================
-- PEDIDOS_DETALLE (ORDER DETAILS)
-- =====================================================

-- Drop existing read policy for pedidos_detalle
DROP POLICY IF EXISTS "Authorized users can read order details" ON pedidos_detalle;

-- Create new read policy allowing all except cabeza_de_tienda
CREATE POLICY "All users except store managers can read order details"
ON pedidos_detalle
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid()
    AND ut.name != 'cabeza_de_tienda'
  )
);

-- =====================================================
-- PEDIDOS_ASIGNACIONES (ORDER ASSIGNMENTS)
-- =====================================================

-- Drop existing read policy for pedidos_asignaciones
DROP POLICY IF EXISTS "Authorized users can read order assignments" ON pedidos_asignaciones;

-- Create new read policy allowing all except cabeza_de_tienda
CREATE POLICY "All users except store managers can read order assignments"
ON pedidos_asignaciones
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid()
    AND ut.name != 'cabeza_de_tienda'
  )
);

-- =====================================================
-- TRASLADOS_INTERNOS (INTERNAL TRANSFERS)
-- =====================================================

-- Update traslados_internos to allow all except cabeza_de_tienda to read
DROP POLICY IF EXISTS "Usuarios autenticados pueden leer traslados_internos" ON traslados_internos;

CREATE POLICY "All users except store managers can read internal transfers"
ON traslados_internos
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid()
    AND ut.name != 'cabeza_de_tienda'
  )
);