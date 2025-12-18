-- Remove the policy that exposes sales data to unauthenticated users
DROP POLICY IF EXISTS "Anon preview can read sales" ON public.registro_ventas_total;

-- Verify that only authenticated users with proper permissions can access sales data
-- The following policies remain in place:
-- 1. "Authorized users can read sales registry" - for admin/vendedora/sales permissions
-- 2. "Ejecutivos pueden ver registro ventas" - for ejecutivo/admin roles