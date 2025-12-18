-- Add columns to ventas table for document information
ALTER TABLE ventas 
ADD COLUMN serial_number text,
ADD COLUMN details_href text;