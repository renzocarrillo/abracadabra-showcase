-- Add seller_id foreign key to ventas table
ALTER TABLE ventas ADD COLUMN seller_id bigint REFERENCES sellers(id) ON DELETE SET NULL ON UPDATE CASCADE;