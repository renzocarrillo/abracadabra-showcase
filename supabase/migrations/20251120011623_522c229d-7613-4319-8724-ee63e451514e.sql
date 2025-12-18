-- ============================================
-- FASE 4: IDEMPOTENCIA - TABLA DE EMISIONES
-- ============================================

-- Crear tabla para registrar intentos de emisión (idempotencia)
CREATE TABLE IF NOT EXISTS public.picking_libre_emissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.picking_libre_sessions(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
  
  -- Payloads para debugging y cache
  request_payload JSONB NOT NULL,
  response_payload JSONB,
  
  -- Error tracking
  error_message TEXT,
  error_details JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  
  -- Metadata
  emission_type TEXT NOT NULL CHECK (emission_type IN ('transfer', 'remission_guide')),
  bsale_document_id INTEGER,
  
  -- Constraints
  CONSTRAINT unique_session_attempt UNIQUE (session_id, attempt_number)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_emissions_session_id ON public.picking_libre_emissions(session_id);
CREATE INDEX IF NOT EXISTS idx_emissions_idempotency_key ON public.picking_libre_emissions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_emissions_status ON public.picking_libre_emissions(status);
CREATE INDEX IF NOT EXISTS idx_emissions_created_at ON public.picking_libre_emissions(created_at DESC);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_emission_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  
  -- Establecer completed_at cuando cambia a success o failed
  IF NEW.status IN ('success', 'failed') AND OLD.status = 'pending' THEN
    NEW.completed_at = now();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_emission_timestamp
BEFORE UPDATE ON public.picking_libre_emissions
FOR EACH ROW
EXECUTE FUNCTION public.update_emission_timestamp();

-- Función helper para generar idempotency key
CREATE OR REPLACE FUNCTION public.generate_idempotency_key(
  p_session_id UUID,
  p_attempt_number INTEGER
)
RETURNS TEXT AS $$
BEGIN
  RETURN encode(
    digest(
      p_session_id::text || '-' || p_attempt_number::text || '-' || extract(epoch from now())::text,
      'sha256'
    ),
    'hex'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Función para obtener o crear registro de emisión (idempotente)
CREATE OR REPLACE FUNCTION public.get_or_create_emission(
  p_session_id UUID,
  p_emission_type TEXT,
  p_request_payload JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_session RECORD;
  v_emission RECORD;
  v_idempotency_key TEXT;
  v_attempt_number INTEGER;
BEGIN
  -- Obtener sesión actual
  SELECT * INTO v_session
  FROM picking_libre_sessions
  WHERE id = p_session_id;
  
  IF v_session IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'SESSION_NOT_FOUND',
      'message', 'Sesión no encontrada'
    );
  END IF;
  
  -- Verificar si ya hay una emisión exitosa para esta sesión
  SELECT * INTO v_emission
  FROM picking_libre_emissions
  WHERE session_id = p_session_id
    AND emission_type = p_emission_type
    AND status = 'success'
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- Si existe emisión exitosa, retornar respuesta cacheada (CACHE HIT)
  IF v_emission.id IS NOT NULL THEN
    RAISE NOTICE '[IDEMPOTENCY] Cache HIT - Retornando respuesta existosa anterior para sesión %', p_session_id;
    
    RETURN jsonb_build_object(
      'success', true,
      'cached', true,
      'emission_id', v_emission.id,
      'idempotency_key', v_emission.idempotency_key,
      'response', v_emission.response_payload,
      'message', 'Emisión ya completada previamente (idempotencia)'
    );
  END IF;
  
  -- Verificar límite de intentos (MAX_RETRIES = 3)
  IF v_session.retry_count >= 3 THEN
    RAISE NOTICE '[IDEMPOTENCY] MAX_RETRIES alcanzado para sesión %', p_session_id;
    
    RETURN jsonb_build_object(
      'success', false,
      'error', 'MAX_RETRIES_EXCEEDED',
      'message', 'Se alcanzó el límite máximo de reintentos (3)'
    );
  END IF;
  
  -- Calcular próximo attempt_number
  SELECT COALESCE(MAX(attempt_number), 0) + 1
  INTO v_attempt_number
  FROM picking_libre_emissions
  WHERE session_id = p_session_id;
  
  -- Generar idempotency key
  v_idempotency_key := generate_idempotency_key(p_session_id, v_attempt_number);
  
  -- Crear nuevo registro de emisión con status='pending'
  INSERT INTO picking_libre_emissions (
    session_id,
    attempt_number,
    idempotency_key,
    status,
    emission_type,
    request_payload
  ) VALUES (
    p_session_id,
    v_attempt_number,
    v_idempotency_key,
    'pending',
    p_emission_type,
    p_request_payload
  )
  RETURNING * INTO v_emission;
  
  RAISE NOTICE '[IDEMPOTENCY] Nuevo intento creado - Sesión: %, Attempt: %, Key: %', 
    p_session_id, v_attempt_number, v_idempotency_key;
  
  -- Retornar información del nuevo intento
  RETURN jsonb_build_object(
    'success', true,
    'cached', false,
    'emission_id', v_emission.id,
    'idempotency_key', v_idempotency_key,
    'attempt_number', v_attempt_number,
    'message', 'Nuevo intento de emisión creado'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para marcar emisión como exitosa y cachear respuesta
CREATE OR REPLACE FUNCTION public.complete_emission_success(
  p_emission_id UUID,
  p_response_payload JSONB,
  p_bsale_document_id INTEGER DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_emission RECORD;
BEGIN
  -- Obtener emisión
  SELECT * INTO v_emission
  FROM picking_libre_emissions
  WHERE id = p_emission_id;
  
  IF v_emission IS NULL THEN
    RAISE EXCEPTION 'Emisión no encontrada: %', p_emission_id;
  END IF;
  
  -- Actualizar emisión a success y cachear respuesta
  UPDATE picking_libre_emissions
  SET 
    status = 'success',
    response_payload = p_response_payload,
    bsale_document_id = p_bsale_document_id,
    completed_at = now(),
    updated_at = now()
  WHERE id = p_emission_id;
  
  RAISE NOTICE '[IDEMPOTENCY] Emisión % marcada como SUCCESS', p_emission_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para marcar emisión como fallida
CREATE OR REPLACE FUNCTION public.complete_emission_failure(
  p_emission_id UUID,
  p_error_message TEXT,
  p_error_details JSONB DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_emission RECORD;
BEGIN
  -- Obtener emisión
  SELECT * INTO v_emission
  FROM picking_libre_emissions
  WHERE id = p_emission_id;
  
  IF v_emission IS NULL THEN
    RAISE EXCEPTION 'Emisión no encontrada: %', p_emission_id;
  END IF;
  
  -- Actualizar emisión a failed
  UPDATE picking_libre_emissions
  SET 
    status = 'failed',
    error_message = p_error_message,
    error_details = p_error_details,
    completed_at = now(),
    updated_at = now()
  WHERE id = p_emission_id;
  
  RAISE NOTICE '[IDEMPOTENCY] Emisión % marcada como FAILED: %', p_emission_id, p_error_message;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentarios para documentación
COMMENT ON TABLE public.picking_libre_emissions IS 'Registra todos los intentos de emisión para picking libre con idempotencia y cache';
COMMENT ON COLUMN public.picking_libre_emissions.idempotency_key IS 'Clave única por sesión + attempt para prevenir emisiones duplicadas';
COMMENT ON COLUMN public.picking_libre_emissions.response_payload IS 'Respuesta de BSale cacheada para retornar en reintentos';
COMMENT ON FUNCTION public.get_or_create_emission IS 'Obtiene emisión exitosa cacheada o crea nuevo intento (idempotente)';
COMMENT ON FUNCTION public.complete_emission_success IS 'Marca emisión como exitosa y cachea respuesta';
COMMENT ON FUNCTION public.complete_emission_failure IS 'Marca emisión como fallida con detalles del error';