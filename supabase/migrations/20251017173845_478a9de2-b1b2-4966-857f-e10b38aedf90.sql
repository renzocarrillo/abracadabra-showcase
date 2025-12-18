-- Make bin_inventories.bin_code FK cascade on bin renames
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'bin_inventories_bin_code_fkey'
      AND table_name = 'bin_inventories'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    EXECUTE 'ALTER TABLE bin_inventories DROP CONSTRAINT bin_inventories_bin_code_fkey';
  END IF;
  
  EXECUTE 'ALTER TABLE bin_inventories
           ADD CONSTRAINT bin_inventories_bin_code_fkey
           FOREIGN KEY (bin_code) REFERENCES bins(bin_code)
           ON UPDATE CASCADE
           ON DELETE RESTRICT
           DEFERRABLE INITIALLY DEFERRED';
END$$;