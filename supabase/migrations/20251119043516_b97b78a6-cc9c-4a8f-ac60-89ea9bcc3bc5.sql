-- ============================================
-- SISTEMA COMPLETO DE AUDITORÍA Y LOGS PARA RASTREAR PROBLEMA DE STOCK
-- ============================================
-- Este migration agrega:
-- 1. Tabla para auditoría detallada de asignaciones de ventas
-- 2. Triggers para rastrear cambios en ventas_asignaciones
-- 3. Logs exhaustivos en funciones críticas
-- 4. Mecanismos para detectar cuándo y por qué se borran asignaciones
-- ============================================

-- ============================================
-- 1. TABLA DE AUDITORÍA DE ASIGNACIONES
-- ============================================
CREATE TABLE IF NOT EXISTS public.ventas_asignaciones_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Información de la asignación
  venta_asignacion_id UUID NOT NULL,
  venta_id UUID NOT NULL,
  venta_codigo TEXT NOT NULL,
  sku TEXT NOT NULL,
  bin TEXT NOT NULL,
  cantidad_asignada INTEGER NOT NULL,
  
  -- Qué operación ocurrió
  operation TEXT NOT NULL,
  
  -- Contexto de la operación
  triggered_by TEXT,
  function_name TEXT,
  trigger_name TEXT,
  
  -- Estado antes y después
  old_data JSONB,
  new_data JSONB,
  
  -- Información del usuario/contexto
  user_id UUID,
  user_email TEXT,
  session_info JSONB,
  
  -- Metadata adicional
  notes TEXT,
  stack_trace TEXT
);

CREATE INDEX idx_ventas_asignaciones_audit_venta_id ON public.ventas_asignaciones_audit(venta_id);
CREATE INDEX idx_ventas_asignaciones_audit_venta_codigo ON public.ventas_asignaciones_audit(venta_codigo);
CREATE INDEX idx_ventas_asignaciones_audit_created_at ON public.ventas_asignaciones_audit(created_at DESC);
CREATE INDEX idx_ventas_asignaciones_audit_operation ON public.ventas_asignaciones_audit(operation);

COMMENT ON TABLE public.ventas_asignaciones_audit IS 'Auditoría exhaustiva de todas las operaciones en ventas_asignaciones';

-- ============================================
-- 2. TRIGGER PARA AUDITAR CAMBIOS
-- ============================================
CREATE OR REPLACE FUNCTION public.audit_ventas_asignaciones()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_venta_codigo TEXT;
  v_user_id UUID;
  v_user_email TEXT;
  v_function_name TEXT;
BEGIN
  SELECT venta_id INTO v_venta_codigo FROM ventas WHERE id = COALESCE(NEW.venta_id, OLD.venta_id);
  v_user_id := auth.uid();
  BEGIN
    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  EXCEPTION WHEN OTHERS THEN
    v_user_email := 'system';
  END;
  v_function_name := current_setting('application_name', true);
  
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.ventas_asignaciones_audit (
      venta_asignacion_id, venta_id, venta_codigo, sku, bin, cantidad_asignada,
      operation, triggered_by, function_name, trigger_name, new_data, user_id, user_email, notes
    ) VALUES (
      NEW.id, NEW.venta_id, v_venta_codigo, NEW.sku, NEW.bin, NEW.cantidad_asignada,
      'INSERT',
      CASE WHEN v_user_id IS NOT NULL THEN 'user' ELSE 'function' END,
      v_function_name, TG_NAME, row_to_json(NEW)::jsonb, v_user_id, v_user_email,
      format('Nueva asignación: %s unidades de %s en bin %s', NEW.cantidad_asignada, NEW.sku, NEW.bin)
    );
    RAISE NOTICE '[AUDIT] Nueva asignación: venta=%, sku=%, bin=%, cantidad=%', v_venta_codigo, NEW.sku, NEW.bin, NEW.cantidad_asignada;
    
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.ventas_asignaciones_audit (
      venta_asignacion_id, venta_id, venta_codigo, sku, bin, cantidad_asignada,
      operation, triggered_by, function_name, trigger_name, old_data, user_id, user_email, notes
    ) VALUES (
      OLD.id, OLD.venta_id, v_venta_codigo, OLD.sku, OLD.bin, OLD.cantidad_asignada,
      'DELETE',
      CASE WHEN v_user_id IS NOT NULL THEN 'user' ELSE 'function' END,
      v_function_name, TG_NAME, row_to_json(OLD)::jsonb, v_user_id, v_user_email,
      format('ASIGNACIÓN ELIMINADA: %s unidades de %s en bin %s', OLD.cantidad_asignada, OLD.sku, OLD.bin)
    );
    RAISE WARNING '[AUDIT] 🚨 ASIGNACIÓN ELIMINADA: venta=%, sku=%, bin=%, cantidad=%', v_venta_codigo, OLD.sku, OLD.bin, OLD.cantidad_asignada;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trigger_audit_ventas_asignaciones ON public.ventas_asignaciones;
CREATE TRIGGER trigger_audit_ventas_asignaciones
  AFTER INSERT OR DELETE ON public.ventas_asignaciones
  FOR EACH ROW EXECUTE FUNCTION public.audit_ventas_asignaciones();

-- ============================================
-- 3. FUNCIÓN verify_and_log_committed_stock
-- ============================================
CREATE OR REPLACE FUNCTION public.verify_and_log_committed_stock(sale_id_param UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_venta_codigo TEXT;
  v_assignment_count INTEGER;
  v_total_committed INTEGER := 0;
  v_assignments JSONB;
  assignment_record RECORD;
BEGIN
  SELECT venta_id INTO v_venta_codigo FROM ventas WHERE id = sale_id_param;
  RAISE NOTICE '🔵 [KEEP_COMMITTED] Verificando stock comprometido para venta %', v_venta_codigo;
  
  SELECT COUNT(*) INTO v_assignment_count FROM ventas_asignaciones WHERE venta_id = sale_id_param;
  
  IF v_assignment_count = 0 THEN
    RAISE WARNING '⚠️ [KEEP_COMMITTED] ¡CRÍTICO! No hay asignaciones para venta %', v_venta_codigo;
    RETURN jsonb_build_object(
      'success', false, 'venta_codigo', v_venta_codigo, 'assignment_count', 0,
      'error', 'NO_ASSIGNMENTS', 'message', 'No existen asignaciones. El stock NO está comprometido.'
    );
  END IF;
  
  v_assignments := '[]'::jsonb;
  FOR assignment_record IN 
    SELECT va.sku, va.bin, va.cantidad_asignada, s.comprometido
    FROM ventas_asignaciones va
    JOIN stockxbin s ON s.id = va.stock_id
    WHERE va.venta_id = sale_id_param
  LOOP
    v_total_committed := v_total_committed + assignment_record.cantidad_asignada;
    v_assignments := v_assignments || jsonb_build_object('sku', assignment_record.sku, 'bin', assignment_record.bin, 'cantidad', assignment_record.cantidad_asignada);
  END LOOP;
  
  PERFORM log_venta_state_change(sale_id_param, v_venta_codigo, 'stock_kept_committed', NULL, NULL, NULL, NULL,
    jsonb_build_object('assignment_count', v_assignment_count, 'total_units_committed', v_total_committed, 'assignments', v_assignments));
  
  RAISE NOTICE '✅ [KEEP_COMMITTED] Stock verificado: venta=%, asignaciones=%, unidades=%', v_venta_codigo, v_assignment_count, v_total_committed;
  
  RETURN jsonb_build_object('success', true, 'venta_codigo', v_venta_codigo, 'assignment_count', v_assignment_count, 
    'total_units_committed', v_total_committed, 'assignments', v_assignments);
END;
$$;

-- ============================================
-- 4. MEJORAR auto_cleanup_archived_stock CON LOGS
-- ============================================
CREATE OR REPLACE FUNCTION public.auto_cleanup_archived_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_assignment_count INTEGER;
BEGIN
    IF NEW.estado = 'archivado' AND OLD.estado != 'archivado' THEN
        RAISE NOTICE '[AUTO_CLEANUP] Trigger activado: tabla=%, venta=%', TG_TABLE_NAME, NEW.venta_id;
        
        IF TG_TABLE_NAME = 'ventas' THEN
            SELECT COUNT(*) INTO v_assignment_count FROM ventas_asignaciones WHERE venta_id = NEW.id;
            RAISE NOTICE '[AUTO_CLEANUP] Asignaciones encontradas: %', v_assignment_count;
            
            IF v_assignment_count > 0 THEN
                RAISE WARNING '[AUTO_CLEANUP] 🚨 Liberando stock comprometido para venta % - % asignaciones', NEW.venta_id, v_assignment_count;
                
                UPDATE stockxbin 
                SET disponibles = disponibles + va.cantidad_asignada, comprometido = comprometido - va.cantidad_asignada, updated_at = now()
                FROM ventas_asignaciones va
                WHERE va.venta_id = NEW.id AND va.stock_id = stockxbin.id;
                
                PERFORM log_venta_state_change(NEW.id, NEW.venta_id, 'auto_cleanup_trigger', OLD.estado, NEW.estado, NULL, 'Sistema',
                  jsonb_build_object('asignaciones_liberadas', v_assignment_count, 'warning', 'Stock liberado por trigger'));
                
                DELETE FROM ventas_asignaciones WHERE venta_id = NEW.id;
                RAISE NOTICE '[AUTO_CLEANUP] Asignaciones eliminadas';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- ============================================
-- 5. RLS POLICIES
-- ============================================
ALTER TABLE public.ventas_asignaciones_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins pueden ver audit asignaciones"
ON public.ventas_asignaciones_audit FOR SELECT
USING (user_has_role('admin'::text) OR user_has_permission('view_audit_logs'::text));

CREATE POLICY "Sistema puede insertar audit asignaciones"
ON public.ventas_asignaciones_audit FOR INSERT WITH CHECK (true);

-- ============================================
-- 6. HELPER PARA CONSULTAR HISTORIAL
-- ============================================
CREATE OR REPLACE FUNCTION public.get_assignment_history(venta_codigo_param TEXT)
RETURNS TABLE (
  created_at TIMESTAMPTZ, operation TEXT, sku TEXT, bin TEXT, cantidad INTEGER,
  triggered_by TEXT, function_name TEXT, user_email TEXT, notes TEXT
)
LANGUAGE SQL SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT created_at, operation, sku, bin, cantidad_asignada, triggered_by, function_name, user_email, notes
  FROM ventas_asignaciones_audit WHERE venta_codigo = venta_codigo_param ORDER BY created_at ASC;
$$;

GRANT SELECT ON public.ventas_asignaciones_audit TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_and_log_committed_stock TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_assignment_history TO authenticated;