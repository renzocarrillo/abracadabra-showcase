-- Fix the move function to handle unique constraint properly
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
  
  -- Use UPSERT to handle destination bin stock
  -- This will either update existing record or insert new one
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
  )
  ON CONFLICT ("idBsale") 
  DO UPDATE SET
    disponibles = CASE 
      WHEN stockxbin.bin = destination_bin_code AND stockxbin.sku = source_stock.sku THEN
        stockxbin.disponibles + move_quantity
      ELSE
        EXCLUDED.disponibles
    END,
    en_existencia = CASE 
      WHEN stockxbin.bin = destination_bin_code AND stockxbin.sku = source_stock.sku THEN
        (stockxbin.disponibles + move_quantity) + stockxbin.comprometido
      ELSE
        EXCLUDED.en_existencia
    END,
    updated_at = now()
  WHERE stockxbin.bin = destination_bin_code AND stockxbin.sku = source_stock.sku;
  
  -- If the conflict resolution didn't work (different bin/sku), we need to handle it differently
  -- Check if we actually need to create a new record by finding existing record in destination bin
  SELECT id, disponibles, comprometido
  INTO dest_stock
  FROM stockxbin 
  WHERE bin = destination_bin_code 
  AND sku = source_stock.sku
  AND "idBsale" != source_stock."idBsale";
  
  IF FOUND THEN
    -- Update the existing record in destination bin (different idBsale)
    UPDATE stockxbin 
    SET 
      disponibles = disponibles + move_quantity,
      en_existencia = (disponibles + move_quantity) + comprometido,
      updated_at = now()
    WHERE id = dest_stock.id;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;