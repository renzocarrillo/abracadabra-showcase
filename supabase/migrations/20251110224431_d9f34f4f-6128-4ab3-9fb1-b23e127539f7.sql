-- Add audit and internal identifier columns to stock_receptions
ALTER TABLE stock_receptions 
  ADD COLUMN created_by UUID REFERENCES auth.users(id),
  ADD COLUMN created_by_name TEXT,
  ADD COLUMN internal_identifier TEXT;

-- Add indexes for efficient querying
CREATE INDEX idx_stock_receptions_created_by ON stock_receptions(created_by);
CREATE INDEX idx_stock_receptions_internal_id ON stock_receptions(internal_identifier);
CREATE INDEX idx_stock_receptions_created_at ON stock_receptions(created_at DESC);

-- Add audit and internal identifier columns to stock_consumptions
ALTER TABLE stock_consumptions 
  ADD COLUMN created_by UUID REFERENCES auth.users(id),
  ADD COLUMN created_by_name TEXT,
  ADD COLUMN internal_identifier TEXT;

-- Add indexes for efficient querying
CREATE INDEX idx_stock_consumptions_created_by ON stock_consumptions(created_by);
CREATE INDEX idx_stock_consumptions_internal_id ON stock_consumptions(internal_identifier);
CREATE INDEX idx_stock_consumptions_created_at ON stock_consumptions(created_at DESC);

-- Add RLS policies for reading logs
CREATE POLICY "Authenticated users can read stock reception logs"
ON stock_receptions FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can read stock consumption logs"
ON stock_consumptions FOR SELECT
TO authenticated
USING (true);