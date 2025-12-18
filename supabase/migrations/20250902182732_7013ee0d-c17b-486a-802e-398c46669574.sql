-- Fix the move function with simpler and more reliable logic
CREATE OR REPLACE FUNCTION public.safe_move_product_between_bins(
  source_stock_id UUID,
  destination_bin_code TEXT,
  move_quantity INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
  source_stock RECORD;
  dest_stock RECORD;
BEGIN
  -- Get source stock information
  SELECT id, sku, "idBsale", disponibles, comprometido, bin
  INTO source_stock
  FROM stockxbin 
  WHERE id = source_stock_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock record not found';
  END IF;
  
  -- Validate sufficient stock
  IF source_stock.disponibles < move_quantity THEN
    RAISE EXCEPTION 'Insufficient stock available';
  END IF;
  
  -- Update source bin (reduce stock)
  UPDATE stockxbin 
  SET 
    disponibles = disponibles - move_quantity,
    en_existencia = (disponibles - move_quantity) + comprometido,
    updated_at = now()
  WHERE id = source_stock_id;
  
  -- Check if destination bin already has this exact SKU
  SELECT id, disponibles, comprometido
  INTO dest_stock
  FROM stockxbin 
  WHERE bin = destination_bin_code 
  AND sku = source_stock.sku;
  
  IF FOUND THEN
    -- Update existing stock in destination bin
    UPDATE stockxbin 
    SET 
      disponibles = disponibles + move_quantity,
      en_existencia = (disponibles + move_quantity) + comprometido,
      updated_at = now()
    WHERE id = dest_stock.id;
  ELSE
    -- Create new stock record in destination bin
    -- Delete any existing record with same idBsale first (since it has unique constraint)
    DELETE FROM stockxbin WHERE "idBsale" = source_stock."idBsale" AND bin != source_stock.bin;
    
    INSERT INTO stockxbin (
      bin,
      sku,
      "idBsale",
      disponibles,
      comprometido,
      en_existencia,
      created_at,
      updated_at
    ) VALUES (
      destination_bin_code,
      source_stock.sku,
      source_stock."idBsale",
      move_quantity,
      0,
      move_quantity,
      now(),
      now()
    );
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Remove inventory_summary table and related triggers
DROP TABLE IF EXISTS public.inventory_summary CASCADE;

-- Remove the trigger functions that update inventory_summary
DROP FUNCTION IF EXISTS public.refresh_inventory_summary_for_sku(text) CASCADE;
DROP FUNCTION IF EXISTS public.refresh_inventory_summary() CASCADE;
DROP FUNCTION IF EXISTS public.update_inventory_summary_trigger() CASCADE;