-- Add updated_at column to pedidos2.0 table
ALTER TABLE "pedidos2.0" 
ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();

-- Create trigger for automatic timestamp updates on pedidos2.0
CREATE TRIGGER update_pedidos_updated_at
BEFORE UPDATE ON "pedidos2.0"
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();