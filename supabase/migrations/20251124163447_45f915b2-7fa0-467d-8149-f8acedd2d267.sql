-- Add tipo_movimiento column to picking_libre_sessions
ALTER TABLE picking_libre_sessions
ADD COLUMN tipo_movimiento TEXT;

COMMENT ON COLUMN picking_libre_sessions.tipo_movimiento IS 'Tipo de movimiento: venta_directa, reposicion, traslado';