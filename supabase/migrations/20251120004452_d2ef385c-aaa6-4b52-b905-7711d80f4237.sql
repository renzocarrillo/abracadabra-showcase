-- ============================================================================
-- FASE 0: PREPARACIÓN Y CONFIGURACIÓN - Plan V3
-- ============================================================================

-- 1. FEATURE FLAGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key text UNIQUE NOT NULL,
  flag_name text NOT NULL,
  description text,
  is_enabled boolean DEFAULT false NOT NULL,
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id)
);

-- Index para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON public.feature_flags(flag_key);

-- Función RPC para obtener feature flag con cache-friendly response
CREATE OR REPLACE FUNCTION public.get_feature_flag(p_flag_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  flag_record RECORD;
BEGIN
  SELECT 
    flag_key,
    is_enabled,
    config,
    updated_at
  INTO flag_record
  FROM feature_flags
  WHERE flag_key = p_flag_key;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', false,
      'is_enabled', false,
      'config', '{}'::jsonb,
      'cache_timestamp', extract(epoch from now())
    );
  END IF;
  
  RETURN jsonb_build_object(
    'found', true,
    'is_enabled', flag_record.is_enabled,
    'config', flag_record.config,
    'cache_timestamp', extract(epoch from flag_record.updated_at)
  );
END;
$$;

-- Insertar feature flags iniciales para el sistema de picking libre
INSERT INTO public.feature_flags (flag_key, flag_name, description, is_enabled, config)
VALUES 
  (
    'picking_libre_recovery_job',
    'Recovery Job de Picking Libre',
    'Activa el job automático de recuperación de sesiones zombie',
    true,
    '{"max_retries": 3, "zombie_threshold_minutes": 30}'::jsonb
  ),
  (
    'picking_libre_optimistic_locking',
    'Bloqueo Optimista en Picking Libre',
    'Activa el sistema de versioning y bloqueo optimista',
    true,
    '{"max_concurrent_attempts": 5}'::jsonb
  ),
  (
    'picking_libre_telemetry',
    'Telemetría de Picking Libre',
    'Activa logging detallado y métricas de picking libre',
    true,
    '{"log_level": "info", "sample_rate": 1.0}'::jsonb
  )
ON CONFLICT (flag_key) DO NOTHING;


-- 2. AUDITORÍA MEJORADA
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.picking_libre_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.picking_libre_sessions(id) ON DELETE CASCADE,
  event_type text NOT NULL, -- 'session_created', 'item_scanned', 'finalize_attempt', 'stock_consumed', 'error', etc.
  event_status text NOT NULL, -- 'success', 'error', 'warning', 'info'
  user_id uuid REFERENCES auth.users(id),
  user_name text,
  details jsonb DEFAULT '{}'::jsonb,
  error_message text,
  stack_trace text,
  retry_count integer DEFAULT 0,
  duration_ms integer, -- Para medir performance
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Índices para queries eficientes
CREATE INDEX IF NOT EXISTS idx_audit_session_id ON public.picking_libre_audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_event_type ON public.picking_libre_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_event_status ON public.picking_libre_audit_log(event_status);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON public.picking_libre_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_error_events ON public.picking_libre_audit_log(event_status, created_at DESC) 
  WHERE event_status = 'error';

-- Función para insertar eventos de auditoría
CREATE OR REPLACE FUNCTION public.log_picking_libre_event(
  p_session_id uuid,
  p_event_type text,
  p_event_status text,
  p_user_id uuid DEFAULT NULL,
  p_user_name text DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_error_message text DEFAULT NULL,
  p_stack_trace text DEFAULT NULL,
  p_retry_count integer DEFAULT 0,
  p_duration_ms integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  log_id uuid;
BEGIN
  INSERT INTO picking_libre_audit_log (
    session_id,
    event_type,
    event_status,
    user_id,
    user_name,
    details,
    error_message,
    stack_trace,
    retry_count,
    duration_ms
  ) VALUES (
    p_session_id,
    p_event_type,
    p_event_status,
    p_user_id,
    p_user_name,
    p_details,
    p_error_message,
    p_stack_trace,
    p_retry_count,
    p_duration_ms
  ) RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$;


-- 3. MODIFICACIONES A TABLA EXISTENTE
-- ============================================================================
-- Agregar campos necesarios para el Plan V3 a picking_libre_sessions si no existen

DO $$ 
BEGIN
  -- data_version para optimistic locking
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'picking_libre_sessions' 
    AND column_name = 'data_version'
  ) THEN
    ALTER TABLE public.picking_libre_sessions 
    ADD COLUMN data_version integer DEFAULT 1 NOT NULL;
  END IF;

  -- last_activity_at para detectar sesiones zombie
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'picking_libre_sessions' 
    AND column_name = 'last_activity_at'
  ) THEN
    ALTER TABLE public.picking_libre_sessions 
    ADD COLUMN last_activity_at timestamptz DEFAULT now() NOT NULL;
  END IF;

  -- retry_count para el sistema de reintentos
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'picking_libre_sessions' 
    AND column_name = 'retry_count'
  ) THEN
    ALTER TABLE public.picking_libre_sessions 
    ADD COLUMN retry_count integer DEFAULT 0 NOT NULL;
  END IF;

  -- last_error para debugging
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'picking_libre_sessions' 
    AND column_name = 'last_error'
  ) THEN
    ALTER TABLE public.picking_libre_sessions 
    ADD COLUMN last_error text;
  END IF;
END $$;

-- Índice para detectar sesiones zombie eficientemente
CREATE INDEX IF NOT EXISTS idx_sessions_zombie_detection 
ON public.picking_libre_sessions(status, last_activity_at, retry_count)
WHERE status IN ('en_proceso', 'verificacion_pendiente');


-- 4. FUNCIÓN PARA DETECTAR SESIONES ZOMBIE (CON PROTECCIÓN ANTI-RACE)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.detect_zombie_sessions()
RETURNS TABLE(
  session_id uuid,
  created_by_name text,
  minutes_inactive integer,
  retry_count integer,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id as session_id,
    s.created_by_name,
    EXTRACT(EPOCH FROM (now() - s.last_activity_at))::integer / 60 as minutes_inactive,
    s.retry_count,
    s.status
  FROM picking_libre_sessions s
  WHERE s.status IN ('en_proceso', 'verificacion_pendiente')
    -- Sesión inactiva por más de 30 minutos
    AND s.last_activity_at < now() - interval '30 minutes'
    -- PROTECCIÓN ANTI-RACE: No tocar sesiones activas recientemente (últimos 10 min)
    AND s.last_activity_at < now() - interval '10 minutes'
    -- No superar máximo de reintentos
    AND s.retry_count < 3
  ORDER BY s.last_activity_at ASC;
END;
$$;


-- 5. TRIGGER PARA ACTUALIZAR last_activity_at AUTOMÁTICAMENTE
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_session_activity_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.last_activity_at = now();
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Aplicar trigger a picking_libre_sessions
DROP TRIGGER IF EXISTS trigger_update_session_activity ON public.picking_libre_sessions;
CREATE TRIGGER trigger_update_session_activity
  BEFORE UPDATE ON public.picking_libre_sessions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status 
    OR OLD.retry_count IS DISTINCT FROM NEW.retry_count
    OR OLD.data_version IS DISTINCT FROM NEW.data_version)
  EXECUTE FUNCTION update_session_activity_timestamp();


-- 6. RLS POLICIES
-- ============================================================================
-- Feature flags: solo admin puede modificar, todos pueden leer
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view feature flags"
  ON public.feature_flags FOR SELECT
  USING (true);

CREATE POLICY "Only admins can modify feature flags"
  ON public.feature_flags FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Audit log: todos pueden insertar, solo admins pueden ver todo
ALTER TABLE public.picking_libre_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert audit logs"
  ON public.picking_libre_audit_log FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can view their own audit logs"
  ON public.picking_libre_audit_log FOR SELECT
  USING (
    user_id = auth.uid() 
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );


-- ============================================================================
-- COMENTARIOS Y DOCUMENTACIÓN
-- ============================================================================
COMMENT ON TABLE public.feature_flags IS 'Sistema de feature flags para control de funcionalidades en producción';
COMMENT ON TABLE public.picking_libre_audit_log IS 'Log detallado de eventos del sistema de picking libre para debugging y observabilidad';
COMMENT ON FUNCTION public.get_feature_flag IS 'Obtiene configuración de feature flag con timestamp para cache-friendly response';
COMMENT ON FUNCTION public.log_picking_libre_event IS 'Registra eventos de auditoría del sistema de picking libre';
COMMENT ON FUNCTION public.detect_zombie_sessions IS 'Detecta sesiones zombie con protección anti-race condition (excluye sesiones activas en últimos 10 min)';

-- Mensaje de confirmación
DO $$
BEGIN
  RAISE NOTICE '✅ FASE 0 completada: Feature flags, auditoría mejorada, y protecciones anti-race implementadas';
END $$;