-- Agregar campo productos_retirados_por a la tabla pedidos
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS productos_retirados_por TEXT;

COMMENT ON COLUMN pedidos.productos_retirados_por IS 'Nombre del usuario que retiró/pickeo los productos del pedido';