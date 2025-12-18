
-- RPC para restaurar stock perdido por fallos en emisión de documentos
CREATE OR REPLACE FUNCTION restore_lost_stock(
  p_sku text,
  p_bin text,
  p_quantity integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  stock_record RECORD;
BEGIN
  -- Get current stock record
  SELECT id, disponibles, en_existencia
  INTO stock_record
  FROM stockxbin
  WHERE sku = p_sku AND bin = p_bin;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Stock record not found'
    );
  END IF;
  
  -- Restore the stock
  UPDATE stockxbin
  SET 
    disponibles = disponibles + p_quantity,
    en_existencia = en_existencia + p_quantity,
    updated_at = now()
  WHERE id = stock_record.id;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Stock restored successfully',
    'sku', p_sku,
    'bin', p_bin,
    'quantity_restored', p_quantity,
    'new_disponibles', stock_record.disponibles + p_quantity,
    'new_en_existencia', stock_record.en_existencia + p_quantity
  );
END;
$$;

-- RPC para completar picking libre (NUEVO - sin consumir stock)
CREATE OR REPLACE FUNCTION complete_picking_libre_safe(
  p_session_id uuid,
  p_tienda_id uuid,
  p_documento_tipo text,
  p_transportista_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  session_record RECORD;
BEGIN
  -- Get session
  SELECT * INTO session_record
  FROM picking_libre_sessions
  WHERE id = p_session_id AND status = 'en_proceso';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Session not found or already completed'
    );
  END IF;
  
  -- Update session (NO consume stock here, that will be done by edge function)
  UPDATE picking_libre_sessions
  SET 
    status = 'completado',
    completed_at = now(),
    tienda_destino_id = p_tienda_id,
    transportista_id = p_transportista_id,
    documento_tipo = p_documento_tipo
  WHERE id = p_session_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Session marked as completed, ready for document emission'
  );
END;
$$;

-- RPC para consumir stock después de confirmar emisión
CREATE OR REPLACE FUNCTION consume_picking_libre_stock(
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  item_record RECORD;
  total_consumed INTEGER := 0;
BEGIN
  -- Consume stock for all items in the session
  FOR item_record IN 
    SELECT stock_id, quantity
    FROM picking_libre_items
    WHERE session_id = p_session_id
  LOOP
    -- Reduce stock from the bin
    UPDATE stockxbin
    SET 
      disponibles = GREATEST(0, disponibles - item_record.quantity),
      en_existencia = GREATEST(0, en_existencia - item_record.quantity),
      updated_at = now()
    WHERE id = item_record.stock_id;
    
    total_consumed := total_consumed + item_record.quantity;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'total_items_consumed', total_consumed
  );
END;
$$;
