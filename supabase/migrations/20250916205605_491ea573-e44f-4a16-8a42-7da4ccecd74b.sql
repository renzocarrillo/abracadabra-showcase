-- Add seller_id foreign key to ventas table
ALTER TABLE ventas ADD COLUMN seller_id bigint REFERENCES sellers(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- Add missing foreign keys and improve existing ones with proper cascade options

-- Add foreign key for transportista_id in ventas (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'ventas_transportista_id_fkey'
  ) THEN
    ALTER TABLE ventas ADD CONSTRAINT ventas_transportista_id_fkey 
    FOREIGN KEY (transportista_id) REFERENCES transportistas(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Add foreign key for tienda_id in pedidos (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'pedidos_tienda_id_fkey'
  ) THEN
    ALTER TABLE pedidos ADD CONSTRAINT pedidos_tienda_id_fkey 
    FOREIGN KEY (tienda_id) REFERENCES tiendas(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Add foreign key for pedido_id in traslados_internos (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'traslados_internos_pedido_id_fkey'
  ) THEN
    ALTER TABLE traslados_internos ADD CONSTRAINT traslados_internos_pedido_id_fkey 
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Add foreign key for tienda_id in traslados_internos (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'traslados_internos_tienda_id_fkey'
  ) THEN
    ALTER TABLE traslados_internos ADD CONSTRAINT traslados_internos_tienda_id_fkey 
    FOREIGN KEY (tienda_id) REFERENCES tiendas(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Add foreign keys for the detail tables
ALTER TABLE pedidos_detalle ADD CONSTRAINT pedidos_detalle_pedido_id_fkey 
FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE ventas_detalle ADD CONSTRAINT ventas_detalle_venta_id_fkey 
FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE traslados_internos_detalle ADD CONSTRAINT traslados_internos_detalle_traslado_id_fkey 
FOREIGN KEY (traslado_id) REFERENCES traslados_internos(id) ON DELETE CASCADE ON UPDATE CASCADE;

-- Add foreign keys for assignment tables
ALTER TABLE pedidos_asignaciones ADD CONSTRAINT pedidos_asignaciones_pedido_id_fkey 
FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE pedidos_asignaciones ADD CONSTRAINT pedidos_asignaciones_pedido_detalle_id_fkey 
FOREIGN KEY (pedido_detalle_id) REFERENCES pedidos_detalle(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE pedidos_asignaciones ADD CONSTRAINT pedidos_asignaciones_stock_id_fkey 
FOREIGN KEY (stock_id) REFERENCES stockxbin(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE ventas_asignaciones ADD CONSTRAINT ventas_asignaciones_venta_id_fkey 
FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE ventas_asignaciones ADD CONSTRAINT ventas_asignaciones_venta_detalle_id_fkey 
FOREIGN KEY (venta_detalle_id) REFERENCES ventas_detalle(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE ventas_asignaciones ADD CONSTRAINT ventas_asignaciones_stock_id_fkey 
FOREIGN KEY (stock_id) REFERENCES stockxbin(id) ON DELETE CASCADE ON UPDATE CASCADE;

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