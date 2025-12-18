-- Add numero_operacion field to ventas table for digital payment method reference numbers
ALTER TABLE ventas ADD COLUMN numero_operacion TEXT;