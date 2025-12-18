-- Create a function to safely update bin names across both tables
CREATE OR REPLACE FUNCTION update_bin_name(old_bin_code text, new_bin_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Start transaction (implicit in function)
  
  -- Update the bins table first
  UPDATE bins 
  SET bin_code = new_bin_code 
  WHERE bin_code = old_bin_code;
  
  -- Update all references in stockxbin
  UPDATE stockxbin 
  SET bin = new_bin_code 
  WHERE bin = old_bin_code;
  
  -- Update references in pedidos_asignaciones if any
  UPDATE pedidos_asignaciones 
  SET bin = new_bin_code 
  WHERE bin = old_bin_code;
  
  -- If we reach here, commit (automatic at end of function)
END;
$$;