-- Agregar campo para registrar quién retiró los productos
ALTER TABLE picking_libre_sessions
ADD COLUMN productos_retirados_por TEXT;

COMMENT ON COLUMN picking_libre_sessions.productos_retirados_por IS 'Nombre de la persona que retiró físicamente los productos, capturado durante la verificación';
