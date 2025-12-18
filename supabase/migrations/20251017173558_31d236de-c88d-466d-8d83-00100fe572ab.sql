-- 1) Ensure FK from stockxbin.bin to bins.bin_code uses ON UPDATE CASCADE and is deferrable
DO $$
BEGIN
  -- Drop existing constraint if present
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'stockxbin_bin_fkey' 
      AND table_name = 'stockxbin'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    EXECUTE 'ALTER TABLE stockxbin DROP CONSTRAINT stockxbin_bin_fkey';
  END IF;
  
  -- Recreate with proper cascading behavior
  EXECUTE 'ALTER TABLE stockxbin 
           ADD CONSTRAINT stockxbin_bin_fkey 
           FOREIGN KEY (bin) REFERENCES bins(bin_code) 
           ON UPDATE CASCADE 
           ON DELETE RESTRICT 
           DEFERRABLE INITIALLY DEFERRED';
END$$;

-- 2) If pedidos_asignaciones.bin has FK to bins.bin_code, align it as well
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'pedidos_asignaciones_bin_fkey' 
      AND table_name = 'pedidos_asignaciones'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    EXECUTE 'ALTER TABLE pedidos_asignaciones DROP CONSTRAINT pedidos_asignaciones_bin_fkey';
    EXECUTE 'ALTER TABLE pedidos_asignaciones 
             ADD CONSTRAINT pedidos_asignaciones_bin_fkey 
             FOREIGN KEY (bin) REFERENCES bins(bin_code) 
             ON UPDATE CASCADE 
             ON DELETE RESTRICT 
             DEFERRABLE INITIALLY DEFERRED';
  END IF;
END$$;

-- 3) Simplify the helper function to let the FK cascade do the work
CREATE OR REPLACE FUNCTION update_bin_name(old_bin_code text, new_bin_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update only the parent; children will cascade
  UPDATE bins 
  SET bin_code = new_bin_code 
  WHERE bin_code = old_bin_code;
END;
$$;