-- Create a function to safely update stock quantities
CREATE OR REPLACE FUNCTION public.safe_update_stock_quantity(
  stock_id UUID,
  new_disponibles INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
  current_comprometido INTEGER;
BEGIN
  -- Get the current comprometido value
  SELECT comprometido INTO current_comprometido 
  FROM stockxbin 
  WHERE id = stock_id;
  
  -- Update the stock record
  UPDATE stockxbin 
  SET 
    disponibles = new_disponibles,
    en_existencia = new_disponibles + current_comprometido,
    updated_at = now()
  WHERE id = stock_id;
  
  -- Return true if the update was successful
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;