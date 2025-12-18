-- Remove the old pedidos2.0 table as it's been replaced by the new structure
-- This table mixed order data with bin assignments, which is now separated

-- First, let's check if there are any important records to preserve
-- (This is just a comment for documentation)

-- Drop the old pedidos2.0 table
DROP TABLE IF EXISTS public."pedidos2.0";