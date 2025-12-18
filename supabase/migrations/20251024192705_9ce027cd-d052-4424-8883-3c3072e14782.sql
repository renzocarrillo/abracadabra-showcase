-- =====================================================
-- FREE PICKING SESSION MANAGEMENT
-- Ensure sessions are automatically canceled when abandoned
-- =====================================================

-- 1. Add updated_at column to picking_libre_sessions (if not exists)
ALTER TABLE picking_libre_sessions 
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 2. Create trigger to auto-update updated_at on picking_libre_sessions
CREATE OR REPLACE FUNCTION update_picking_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_picking_libre_sessions_timestamp ON picking_libre_sessions;
CREATE TRIGGER update_picking_libre_sessions_timestamp
BEFORE UPDATE ON picking_libre_sessions
FOR EACH ROW
EXECUTE FUNCTION update_picking_session_timestamp();

-- 3. Create trigger to touch parent session when items are inserted
CREATE OR REPLACE FUNCTION touch_picking_session_on_item_insert()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE picking_libre_sessions 
  SET updated_at = now() 
  WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS touch_session_on_item_insert ON picking_libre_items;
CREATE TRIGGER touch_session_on_item_insert
AFTER INSERT ON picking_libre_items
FOR EACH ROW
EXECUTE FUNCTION touch_picking_session_on_item_insert();

-- 4. Add free_picking TTL setting to system_settings (if not exists)
INSERT INTO system_settings (setting_key, setting_value, updated_by)
VALUES (
  'free_picking',
  '{"ttl_minutes": 30}'::jsonb,
  (SELECT id FROM auth.users WHERE email LIKE '%admin%' LIMIT 1)
)
ON CONFLICT (setting_key) DO NOTHING;

-- 5. Create RPC to cancel a specific session
CREATE OR REPLACE FUNCTION cancel_picking_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_record RECORD;
BEGIN
  -- Get session and verify ownership or admin
  SELECT * INTO session_record
  FROM picking_libre_sessions
  WHERE id = p_session_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Sesión no encontrada'
    );
  END IF;
  
  -- Check if already completed or canceled
  IF session_record.status != 'en_proceso' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'La sesión ya está finalizada o cancelada'
    );
  END IF;
  
  -- Check permissions: owner or admin
  IF session_record.created_by != auth.uid() AND NOT user_has_role('admin') THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'No tienes permiso para cancelar esta sesión'
    );
  END IF;
  
  -- Cancel the session
  UPDATE picking_libre_sessions
  SET 
    status = 'cancelado',
    completed_at = now(),
    updated_at = now()
  WHERE id = p_session_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Sesión cancelada correctamente'
  );
END;
$$;

-- 6. Create RPC to cleanup inactive sessions
CREATE OR REPLACE FUNCTION cleanup_inactive_picking_sessions(p_minutes integer DEFAULT 120)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sessions_canceled INTEGER := 0;
  cutoff_time timestamptz;
BEGIN
  cutoff_time := now() - (p_minutes || ' minutes')::interval;
  
  -- Cancel all sessions that haven't been updated in p_minutes
  UPDATE picking_libre_sessions
  SET 
    status = 'cancelado',
    completed_at = now(),
    updated_at = now()
  WHERE status = 'en_proceso'
    AND updated_at < cutoff_time;
  
  GET DIAGNOSTICS sessions_canceled = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'sessions_canceled', sessions_canceled,
    'cutoff_time', cutoff_time,
    'message', format('Se cancelaron %s sesiones inactivas', sessions_canceled)
  );
END;
$$;

-- 7. Update validate_product_available to ignore old sessions
CREATE OR REPLACE FUNCTION validate_product_available(
  p_sku text,
  p_bin_code text,
  p_quantity integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stock_record RECORD;
  producto_congelado BOOLEAN;
  total_scanned_in_active_sessions INTEGER := 0;
  ttl_minutes INTEGER := 30;
  cutoff_time timestamptz;
  settings_record RECORD;
BEGIN
  -- Get TTL from system_settings
  SELECT setting_value INTO settings_record
  FROM system_settings
  WHERE setting_key = 'free_picking';
  
  IF FOUND THEN
    ttl_minutes := COALESCE((settings_record.setting_value->>'ttl_minutes')::integer, 30);
  END IF;
  
  cutoff_time := now() - (ttl_minutes || ' minutes')::interval;
  
  -- Check if product is frozen
  SELECT EXISTS (
    SELECT 1 FROM productos_congelados WHERE sku = p_sku
  ) INTO producto_congelado;
  
  IF producto_congelado THEN
    RETURN jsonb_build_object(
      'available', false,
      'message', 'Producto congelado - no disponible para picking'
    );
  END IF;
  
  -- Get stock record
  SELECT id, sku, bin, disponibles, comprometido
  INTO stock_record
  FROM stockxbin
  WHERE sku = p_sku AND bin = p_bin_code;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'available', false,
      'message', format('Producto %s no encontrado en bin %s', p_sku, p_bin_code)
    );
  END IF;
  
  -- Count what's been scanned in ACTIVE sessions (within TTL) for this SKU/BIN
  SELECT COALESCE(SUM(pli.quantity), 0)
  INTO total_scanned_in_active_sessions
  FROM picking_libre_items pli
  JOIN picking_libre_sessions pls ON pli.session_id = pls.id
  WHERE pli.sku = p_sku
    AND pli.bin_code = p_bin_code
    AND pls.status = 'en_proceso'
    AND pls.updated_at >= cutoff_time;
  
  -- Calculate real availability
  IF (stock_record.disponibles - total_scanned_in_active_sessions) < p_quantity THEN
    RETURN jsonb_build_object(
      'available', false,
      'message', format('Stock insuficiente en bin %s. Disponible: %s, Requerido: %s (ya escaneado en otras sesiones activas: %s)', 
        p_bin_code, 
        stock_record.disponibles - total_scanned_in_active_sessions, 
        p_quantity,
        total_scanned_in_active_sessions
      )
    );
  END IF;
  
  RETURN jsonb_build_object(
    'available', true,
    'stock_id', stock_record.id,
    'message', 'Producto disponible'
  );
END;
$$;

-- 8. Create performance indexes
CREATE INDEX IF NOT EXISTS idx_picking_libre_items_sku_bin_session 
ON picking_libre_items(sku, bin_code, session_id, scanned_at);

CREATE INDEX IF NOT EXISTS idx_picking_libre_sessions_status_updated 
ON picking_libre_sessions(status, updated_at);

-- 9. Grant execute permissions on new functions
GRANT EXECUTE ON FUNCTION cancel_picking_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_inactive_picking_sessions(integer) TO authenticated;