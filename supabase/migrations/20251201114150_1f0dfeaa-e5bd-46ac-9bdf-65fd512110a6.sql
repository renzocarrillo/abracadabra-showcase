-- Crear tabla para sesiones de sincronización de imágenes
CREATE TABLE IF NOT EXISTS shopify_image_sync_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'completed', 'failed', 'cancelled'
  total_products INTEGER NOT NULL DEFAULT 0,
  total_batches INTEGER NOT NULL DEFAULT 0,
  current_batch INTEGER NOT NULL DEFAULT 0,
  products_synced INTEGER NOT NULL DEFAULT 0,
  products_failed INTEGER NOT NULL DEFAULT 0,
  products_skipped INTEGER NOT NULL DEFAULT 0,
  started_by UUID REFERENCES profiles(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  force_refresh BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE shopify_image_sync_sessions ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Authenticated users can read image sync sessions"
  ON shopify_image_sync_sessions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can insert image sync sessions"
  ON shopify_image_sync_sessions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "System can update image sync sessions"
  ON shopify_image_sync_sessions FOR UPDATE
  TO authenticated
  USING (true);

-- Función RPC para actualizar estadísticas
CREATE OR REPLACE FUNCTION increment_shopify_image_sync_stats(
  p_session_id UUID,
  p_synced INTEGER DEFAULT 0,
  p_failed INTEGER DEFAULT 0,
  p_skipped INTEGER DEFAULT 0,
  p_current_batch INTEGER DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  UPDATE shopify_image_sync_sessions
  SET 
    products_synced = products_synced + p_synced,
    products_failed = products_failed + p_failed,
    products_skipped = products_skipped + p_skipped,
    current_batch = COALESCE(p_current_batch, current_batch),
    updated_at = NOW()
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;