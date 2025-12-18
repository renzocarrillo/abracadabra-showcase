-- Add seller_id foreign key to ventas table
ALTER TABLE ventas ADD COLUMN seller_id bigint REFERENCES sellers(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- Create trigger to update product names in related tables when variants table is updated
CREATE OR REPLACE FUNCTION update_product_names_cascade()
RETURNS TRIGGER AS $$
BEGIN
  -- Update product names in pedidos_detalle
  UPDATE pedidos_detalle 
  SET nombre_producto = NEW.nombreProducto
  WHERE sku = NEW.sku;
  
  -- Update product names in ventas_detalle  
  UPDATE ventas_detalle 
  SET nombre_producto = NEW.nombreProducto
  WHERE sku = NEW.sku;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on variants table
DROP TRIGGER IF EXISTS trigger_update_product_names ON variants;
CREATE TRIGGER trigger_update_product_names
  AFTER UPDATE OF nombreProducto ON variants
  FOR EACH ROW
  EXECUTE FUNCTION update_product_names_cascade();