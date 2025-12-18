-- Agregar campo tipo a la tabla pedidos para distinguir entre Tienda y Web
ALTER TABLE pedidos ADD COLUMN tipo text NOT NULL DEFAULT 'Tienda';

-- Actualizar pedidos existentes para ser tipo Tienda (ya que fueron creados desde /crear-pedido)
UPDATE pedidos SET tipo = 'Tienda' WHERE tipo IS NULL OR tipo = '';

-- Agregar índice para mejorar performance de filtros por tipo
CREATE INDEX idx_pedidos_tipo ON pedidos(tipo);