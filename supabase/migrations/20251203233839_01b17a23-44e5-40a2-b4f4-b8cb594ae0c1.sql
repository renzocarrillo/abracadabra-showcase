-- Add column to store BSale guide ID for easier querying
ALTER TABLE traslados_internos 
ADD COLUMN IF NOT EXISTS bsale_guide_id BIGINT;