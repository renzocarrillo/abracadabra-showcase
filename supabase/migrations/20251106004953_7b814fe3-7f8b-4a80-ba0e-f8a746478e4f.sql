-- Add unique_products column to picking_libre_sessions
ALTER TABLE picking_libre_sessions 
ADD COLUMN IF NOT EXISTS unique_products INTEGER DEFAULT 0;

-- Create function to automatically update totals when items are inserted/deleted
CREATE OR REPLACE FUNCTION update_picking_libre_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_session_id UUID;
BEGIN
  -- Determine which session_id to use based on operation
  IF TG_OP = 'DELETE' THEN
    v_session_id := OLD.session_id;
  ELSE
    v_session_id := NEW.session_id;
  END IF;

  -- Update totals in the session
  UPDATE picking_libre_sessions
  SET 
    total_items = (
      SELECT COALESCE(SUM(quantity), 0)
      FROM picking_libre_items
      WHERE session_id = v_session_id
    ),
    unique_products = (
      SELECT COUNT(DISTINCT sku)
      FROM picking_libre_items
      WHERE session_id = v_session_id
    ),
    updated_at = now()
  WHERE id = v_session_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger that fires after INSERT or DELETE on picking_libre_items
DROP TRIGGER IF EXISTS trigger_update_picking_libre_totals ON picking_libre_items;
CREATE TRIGGER trigger_update_picking_libre_totals
AFTER INSERT OR DELETE ON picking_libre_items
FOR EACH ROW
EXECUTE FUNCTION update_picking_libre_totals();

-- Recalculate totals for all existing sessions
UPDATE picking_libre_sessions pls
SET 
  total_items = COALESCE((
    SELECT SUM(quantity)
    FROM picking_libre_items pli
    WHERE pli.session_id = pls.id
  ), 0),
  unique_products = COALESCE((
    SELECT COUNT(DISTINCT sku)
    FROM picking_libre_items pli
    WHERE pli.session_id = pls.id
  ), 0)
WHERE EXISTS (
  SELECT 1 FROM picking_libre_items WHERE session_id = pls.id
);