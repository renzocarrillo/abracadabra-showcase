-- Add column to store destination store name for easier querying
ALTER TABLE traslados_internos 
ADD COLUMN IF NOT EXISTS sucursal_destino_nombre TEXT;