-- Fix Critical Security Issue: Restrict access to sales detail information

-- ventas_detalle table - Contains sensitive sales information (SKUs, quantities, pricing)
DROP POLICY IF EXISTS "Usuarios autenticados pueden leer ventas_detalle" ON public.ventas_detalle;
DROP POLICY IF EXISTS "Usuarios autenticados pueden insertar ventas_detalle" ON public.ventas_detalle;
DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar ventas_detalle" ON public.ventas_detalle;

-- Restrict to authorized roles only (admin and vendedora)
CREATE POLICY "Authorized users can read sales details" ON public.ventas_detalle
  FOR SELECT USING (
    public.user_has_role('admin') OR 
    public.user_has_role('vendedora')
  );

CREATE POLICY "Authorized users can create sales details" ON public.ventas_detalle
  FOR INSERT WITH CHECK (
    public.user_has_role('admin') OR 
    public.user_has_role('vendedora')
  );

CREATE POLICY "Authorized users can update sales details" ON public.ventas_detalle
  FOR UPDATE USING (
    public.user_has_role('admin') OR 
    public.user_has_role('vendedora')
  );

-- pedidos_detalle table - Also contains sensitive order information
DROP POLICY IF EXISTS "Usuarios autenticados pueden leer pedidos_detalle" ON public.pedidos_detalle;
DROP POLICY IF EXISTS "Usuarios autenticados pueden insertar pedidos_detalle" ON public.pedidos_detalle;
DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar pedidos_detalle" ON public.pedidos_detalle;

CREATE POLICY "Authorized users can read order details" ON public.pedidos_detalle
  FOR SELECT USING (
    public.user_has_role('admin') OR 
    public.user_has_role('vendedora')
  );

CREATE POLICY "Authorized users can create order details" ON public.pedidos_detalle
  FOR INSERT WITH CHECK (
    public.user_has_role('admin') OR 
    public.user_has_role('vendedora')
  );

CREATE POLICY "Authorized users can update order details" ON public.pedidos_detalle
  FOR UPDATE USING (
    public.user_has_role('admin') OR 
    public.user_has_role('vendedora')
  );

-- ventas_asignaciones table - Contains stock allocation data
DROP POLICY IF EXISTS "Usuarios autenticados pueden leer ventas_asignaciones" ON public.ventas_asignaciones;
DROP POLICY IF EXISTS "Usuarios autenticados pueden insertar ventas_asignaciones" ON public.ventas_asignaciones;
DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar ventas_asignaciones" ON public.ventas_asignaciones;

CREATE POLICY "Admin can manage sales assignments" ON public.ventas_asignaciones
  FOR ALL USING (public.user_has_role('admin'));

-- pedidos_asignaciones table - Contains order stock allocation data  
DROP POLICY IF EXISTS "Usuarios autenticados pueden leer pedidos_asignaciones" ON public.pedidos_asignaciones;
DROP POLICY IF EXISTS "Usuarios autenticados pueden insertar pedidos_asignaciones" ON public.pedidos_asignaciones;
DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar pedidos_asignaciones" ON public.pedidos_asignaciones;

CREATE POLICY "Admin can manage order assignments" ON public.pedidos_asignaciones
  FOR ALL USING (public.user_has_role('admin'));

-- Add security logging for sensitive data access
CREATE OR REPLACE FUNCTION public.log_sensitive_data_access()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.security_audit_log (
    user_id,
    action,
    table_name,
    record_id,
    details,
    created_at
  ) VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    CASE 
      WHEN TG_OP = 'DELETE' THEN OLD.id::text
      ELSE NEW.id::text
    END,
    jsonb_build_object(
      'operation', TG_OP,
      'table', TG_TABLE_NAME,
      'timestamp', now()
    ),
    now()
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add audit triggers for sensitive tables
CREATE TRIGGER audit_ventas_detalle
  AFTER INSERT OR UPDATE OR DELETE ON public.ventas_detalle
  FOR EACH ROW EXECUTE FUNCTION public.log_sensitive_data_access();

CREATE TRIGGER audit_pedidos_detalle
  AFTER INSERT OR UPDATE OR DELETE ON public.pedidos_detalle
  FOR EACH ROW EXECUTE FUNCTION public.log_sensitive_data_access();