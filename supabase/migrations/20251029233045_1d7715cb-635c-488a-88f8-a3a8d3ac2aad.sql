-- Fix V1011 updated_at to match created_at
UPDATE ventas 
SET updated_at = created_at 
WHERE venta_id = 'V1011';