-- Create safe function for moving products between bins
CREATE OR REPLACE FUNCTION public.safe_move_product_between_bins(
  source_stock_id UUID,
  destination_bin_code TEXT,
  move_quantity INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
  source_stock RECORD;
  dest_stock RECORD;
  product_id_bsale TEXT;
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
  
  -- Check if destination bin already has this SKU
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
    INSERT INTO stockxbin (
      bin,
      sku,
      "idBsale",
      disponibles,
      comprometido,
      en_existencia
    ) VALUES (
      destination_bin_code,
      source_stock.sku,
      source_stock."idBsale",
      move_quantity,
      0,
      move_quantity
    );
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;