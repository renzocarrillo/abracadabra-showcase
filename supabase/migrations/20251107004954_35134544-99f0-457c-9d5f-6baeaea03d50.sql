-- Fix consume_picking_libre_stock to handle NULL stock_id gracefully
-- This can happen with legacy data or edge cases

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
  items_without_stock_id INTEGER := 0;
BEGIN
  -- Consume stock for all items in the session
  FOR item_record IN 
    SELECT stock_id, quantity, sku, bin_code
    FROM picking_libre_items
    WHERE session_id = p_session_id
  LOOP
    -- Skip if stock_id is NULL (shouldn't happen but defensive)
    IF item_record.stock_id IS NULL THEN
      RAISE WARNING 'Item with SKU % in bin % has NULL stock_id, skipping stock consumption', 
        item_record.sku, item_record.bin_code;
      items_without_stock_id := items_without_stock_id + 1;
      CONTINUE;
    END IF;
    
    -- Reduce stock from the bin
    UPDATE stockxbin
    SET 
      disponibles = GREATEST(0, disponibles - item_record.quantity),
      en_existencia = GREATEST(0, en_existencia - item_record.quantity),
      updated_at = now()
    WHERE id = item_record.stock_id;
    
    -- Check if update actually affected a row
    IF NOT FOUND THEN
      RAISE WARNING 'Stock record % not found for SKU % in bin %', 
        item_record.stock_id, item_record.sku, item_record.bin_code;
    ELSE
      total_consumed := total_consumed + item_record.quantity;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'total_items_consumed', total_consumed,
    'items_without_stock_id', items_without_stock_id
  );
END;
$$;