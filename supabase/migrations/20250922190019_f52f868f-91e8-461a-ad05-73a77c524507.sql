-- CORRECCIÓN INMEDIATA DE PROBLEMAS DE SEGURIDAD DETECTADOS
-- ==========================================================

-- 1. CORREGIR SECURITY DEFINER VIEW (ERROR CRÍTICO)
-- Eliminar vista problemática y crear función segura alternativa
DROP VIEW IF EXISTS public.ventas_secure;

-- Crear función segura para obtener ventas con datos protegidos
CREATE OR REPLACE FUNCTION public.get_secure_ventas()
RETURNS TABLE (
  id uuid,
  venta_id text,
  estado venta_estado,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  cliente_info jsonb,
  total numeric,
  subtotal numeric,
  igv numeric,
  metodo_pago text,
  notas text,
  serial_number text,
  url_public_view text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verificar autorización
  IF NOT (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND deleted_at IS NULL AND role IN ('admin', 'vendedora'))
    OR public.user_has_permission('view_sales')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT 
    v.id,
    v.venta_id,
    v.estado,
    v.created_at,
    v.updated_at,
    -- Enmascarar datos del cliente según permisos
    CASE 
      WHEN public.can_access_financial_data() THEN v.cliente_info
      ELSE public.mask_client_data(v.cliente_info, auth.uid())
    END as cliente_info,
    -- Mostrar datos financieros solo a usuarios autorizados
    CASE 
      WHEN public.can_access_financial_data() THEN v.total
      ELSE 0::numeric
    END as total,
    CASE 
      WHEN public.can_access_financial_data() THEN v.subtotal  
      ELSE 0::numeric
    END as subtotal,
    CASE 
      WHEN public.can_access_financial_data() THEN v.igv
      ELSE 0::numeric
    END as igv,
    v.metodo_pago,
    v.notas,
    v.serial_number,
    v.url_public_view
  FROM public.ventas v;
END;
$$;

-- 2. CORREGIR SEARCH PATH EN FUNCIONES (3 FUNCIONES)
-- Agregar SET search_path a funciones que no lo tienen

CREATE OR REPLACE FUNCTION public.log_sensitive_data_access(
  table_name text,
  record_id text,
  operation text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo registrar si es una operación en tabla sensible
  IF table_name IN ('ventas', 'profiles', 'security_audit_log', 'tiendas') THEN
    PERFORM public.insert_security_audit_log(
      auth.uid(),
      operation || '_sensitive_data',
      table_name,
      record_id,
      jsonb_build_object(
        'table', table_name,
        'operation', operation,
        'timestamp', now()
      )
    );
  END IF;
END;
$$;

-- Corregir funciones existentes que pueden no tener search_path
CREATE OR REPLACE FUNCTION public.combine_stockxbin_records()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    existing_record RECORD;
BEGIN
    -- Check if a record with the same sku, idBsale, and bin already exists
    SELECT id, disponibles, comprometido
    INTO existing_record
    FROM stockxbin 
    WHERE sku = NEW.sku 
    AND "idBsale" = NEW."idBsale" 
    AND bin = NEW.bin
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    
    -- If an existing record is found, update it and prevent the insert
    IF existing_record.id IS NOT NULL THEN
        UPDATE stockxbin 
        SET 
            disponibles = COALESCE(existing_record.disponibles, 0) + COALESCE(NEW.disponibles, 0),
            comprometido = COALESCE(existing_record.comprometido, 0) + COALESCE(NEW.comprometido, 0),
            updated_at = now()
        WHERE id = existing_record.id;
        
        -- Return NULL to prevent the insert of the new record
        RETURN NULL;
    END IF;
    
    -- If no existing record found, allow the insert to proceed
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_stock_values()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Ensure no negative values
    NEW.disponibles := GREATEST(0, COALESCE(NEW.disponibles, 0));
    NEW.comprometido := GREATEST(0, COALESCE(NEW.comprometido, 0));
    
    -- Recalculate en_existencia
    NEW.en_existencia := NEW.disponibles + NEW.comprometido;
    
    -- Update timestamp
    NEW.updated_at := now();
    
    RETURN NEW;
END;
$$;

-- 3. MOVER EXTENSIÓN pgcrypto DE PUBLIC SCHEMA A EXTENSIONS
-- Verificar si existe en public y moverla si es necesario
DO $$
BEGIN
  -- Verificar si pgcrypto está en public schema
  IF EXISTS (
    SELECT 1 FROM pg_extension 
    WHERE extname = 'pgcrypto' 
    AND extnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    -- Recrear en extensions schema
    DROP EXTENSION IF EXISTS pgcrypto CASCADE;
    CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;
  END IF;
END;
$$;

-- 4. CONFIGURAR AUDITORÍA PARA ACCESOS CRÍTICOS
-- Función mejorada para auditar automáticamente accesos a datos sensibles
CREATE OR REPLACE FUNCTION public.auto_audit_sensitive_operations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Auditar operaciones en tablas sensibles
  IF TG_TABLE_NAME IN ('ventas', 'profiles', 'tiendas', 'pedidos') AND TG_OP IN ('INSERT', 'UPDATE', 'DELETE') THEN
    PERFORM public.insert_security_audit_log(
      auth.uid(),
      TG_OP || '_' || TG_TABLE_NAME,
      TG_TABLE_NAME,
      CASE 
        WHEN TG_OP = 'DELETE' THEN OLD.id::text
        ELSE NEW.id::text
      END,
      jsonb_build_object(
        'operation', TG_OP,
        'table', TG_TABLE_NAME,
        'timestamp', now(),
        'changes', CASE 
          WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('modified', true)
          WHEN TG_OP = 'INSERT' THEN jsonb_build_object('created', true)
          WHEN TG_OP = 'DELETE' THEN jsonb_build_object('deleted', true)
          ELSE null
        END
      )
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Aplicar triggers de auditoría a tablas críticas
DROP TRIGGER IF EXISTS auto_audit_ventas ON public.ventas;
CREATE TRIGGER auto_audit_ventas
  AFTER INSERT OR UPDATE OR DELETE ON public.ventas
  FOR EACH ROW EXECUTE FUNCTION public.auto_audit_sensitive_operations();

DROP TRIGGER IF EXISTS auto_audit_profiles ON public.profiles;
CREATE TRIGGER auto_audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.auto_audit_sensitive_operations();

DROP TRIGGER IF EXISTS auto_audit_tiendas ON public.tiendas;
CREATE TRIGGER auto_audit_tiendas
  AFTER INSERT OR UPDATE OR DELETE ON public.tiendas
  FOR EACH ROW EXECUTE FUNCTION public.auto_audit_tiendas();

-- 5. CREAR POLÍTICA ESTRICTA PARA PERFILES ELIMINADOS
-- Asegurar que usuarios eliminados no puedan hacer nada
CREATE OR REPLACE FUNCTION public.check_user_not_deleted()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND deleted_at IS NULL
  );
$$;

-- Aplicar verificación de usuario no eliminado a todas las políticas críticas
DROP POLICY IF EXISTS "Only active users can access" ON public.security_audit_log;
CREATE POLICY "Only active admins can view audit logs" ON public.security_audit_log
FOR SELECT USING (
  public.check_user_not_deleted() 
  AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'::user_role AND deleted_at IS NULL
  )
);

-- 6. BLOQUEAR COMPLETAMENTE MODIFICACIONES DIRECTAS A LOGS
-- Política ultra-restrictiva para logs de auditoría
DROP POLICY IF EXISTS "Block direct user modifications" ON public.security_audit_log;
DROP POLICY IF EXISTS "System function can insert audit logs" ON public.security_audit_log;

-- Solo la función específica puede insertar, nada más
CREATE POLICY "Audit logs read only" ON public.security_audit_log
FOR ALL USING (false);

-- 7. CREAR FUNCIÓN PARA LIMPIAR PERIÓDICAMENTE LOGS ANTIGUOS
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Solo admins pueden ejecutar esta función
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'::user_role AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Eliminar logs de más de 6 meses
  DELETE FROM public.security_audit_log 
  WHERE created_at < now() - interval '6 months';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Registrar la limpieza
  PERFORM public.insert_security_audit_log(
    auth.uid(),
    'cleanup_audit_logs',
    'security_audit_log',
    null,
    jsonb_build_object('deleted_records', deleted_count)
  );
  
  RETURN deleted_count;
END;
$$;