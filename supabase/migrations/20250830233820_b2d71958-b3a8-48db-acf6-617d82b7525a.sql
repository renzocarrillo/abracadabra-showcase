-- Add documento_emitido_at column to track when documentoEmitido was set to true
ALTER TABLE "pedidos2.0" 
ADD COLUMN documento_emitido_at TIMESTAMP WITH TIME ZONE;

-- Create function to update documento_emitido_at only when documentoEmitido changes to true
CREATE OR REPLACE FUNCTION public.update_documento_emitido_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update documento_emitido_at when documentoEmitido changes from false/null to true
  IF (OLD.documentoEmitido IS DISTINCT FROM TRUE) AND (NEW.documentoEmitido = TRUE) THEN
    NEW.documento_emitido_at = now();
  END IF;
  
  -- Always update updated_at for any change
  NEW.updated_at = now();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop the existing trigger and create new one with specific logic
DROP TRIGGER IF EXISTS update_pedidos_updated_at ON "pedidos2.0";

CREATE TRIGGER update_pedidos_documento_emitido_at
BEFORE UPDATE ON "pedidos2.0"
FOR EACH ROW
EXECUTE FUNCTION public.update_documento_emitido_at();

-- Migrate existing data: set documento_emitido_at to created_at for orders that already have documentoEmitido = true
UPDATE "pedidos2.0" 
SET documento_emitido_at = created_at 
WHERE documentoEmitido = true AND documento_emitido_at IS NULL;