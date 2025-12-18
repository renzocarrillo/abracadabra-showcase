-- Simplificar políticas RLS para ventas_asignaciones, ventas y ventas_detalle
-- Esto permite que todos los usuarios autenticados puedan trabajar libremente
-- mientras mantiene seguridad básica (autenticación requerida, solo admins pueden eliminar)

-- ============================================
-- VENTAS_ASIGNACIONES: Simplificar políticas
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Authorized users can create sales assignments" ON ventas_asignaciones;
DROP POLICY IF EXISTS "Authorized users can update sales assignments" ON ventas_asignaciones;
DROP POLICY IF EXISTS "Authorized users can read sales assignments" ON ventas_asignaciones;
DROP POLICY IF EXISTS "Admins can delete sales assignments" ON ventas_asignaciones;

-- Create simplified policies
CREATE POLICY "Authenticated users can insert sales assignments"
ON ventas_asignaciones
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update sales assignments"
ON ventas_asignaciones
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can read sales assignments"
ON ventas_asignaciones
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Only admins can delete sales assignments"
ON ventas_asignaciones
FOR DELETE
TO authenticated
USING (user_has_role('admin'));

-- ============================================
-- VENTAS: Simplificar políticas
-- ============================================

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can view sales" ON ventas;
DROP POLICY IF EXISTS "Users can create sales" ON ventas;
DROP POLICY IF EXISTS "Users can update sales" ON ventas;
DROP POLICY IF EXISTS "Users can delete sales" ON ventas;
DROP POLICY IF EXISTS "Authorized users can view sales" ON ventas;
DROP POLICY IF EXISTS "Authorized users can create sales" ON ventas;
DROP POLICY IF EXISTS "Authorized users can update sales" ON ventas;
DROP POLICY IF EXISTS "Authorized users can delete sales" ON ventas;

-- Create simplified policies
CREATE POLICY "Authenticated users can read sales"
ON ventas
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert sales"
ON ventas
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update sales"
ON ventas
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Only admins can delete sales"
ON ventas
FOR DELETE
TO authenticated
USING (user_has_role('admin'));

-- ============================================
-- VENTAS_DETALLE: Simplificar políticas
-- ============================================

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can view sale details" ON ventas_detalle;
DROP POLICY IF EXISTS "Users can create sale details" ON ventas_detalle;
DROP POLICY IF EXISTS "Users can update sale details" ON ventas_detalle;
DROP POLICY IF EXISTS "Users can delete sale details" ON ventas_detalle;
DROP POLICY IF EXISTS "Authorized users can view sale details" ON ventas_detalle;
DROP POLICY IF EXISTS "Authorized users can create sale details" ON ventas_detalle;
DROP POLICY IF EXISTS "Authorized users can update sale details" ON ventas_detalle;
DROP POLICY IF EXISTS "Authorized users can delete sale details" ON ventas_detalle;

-- Create simplified policies
CREATE POLICY "Authenticated users can read sale details"
ON ventas_detalle
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert sale details"
ON ventas_detalle
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update sale details"
ON ventas_detalle
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Only admins can delete sale details"
ON ventas_detalle
FOR DELETE
TO authenticated
USING (user_has_role('admin'));

-- ============================================
-- Comentarios para documentación
-- ============================================

COMMENT ON POLICY "Authenticated users can insert sales assignments" ON ventas_asignaciones IS 
'Permite a todos los usuarios autenticados crear asignaciones de stock para ventas. Esto es necesario para que la función assign_bins_to_sale funcione correctamente.';

COMMENT ON POLICY "Only admins can delete sales assignments" ON ventas_asignaciones IS 
'Solo administradores pueden eliminar asignaciones para prevenir pérdida de datos accidental.';

COMMENT ON POLICY "Authenticated users can read sales" ON ventas IS 
'Todos los usuarios autenticados pueden ver ventas para realizar su trabajo.';

COMMENT ON POLICY "Only admins can delete sales" ON ventas IS 
'Solo administradores pueden eliminar ventas para mantener integridad de datos históricos.';