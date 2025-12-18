-- Marcar la venta V1004 como completada y archivada
UPDATE ventas 
SET 
  estado = 'archivado',
  updated_at = now()
WHERE venta_id = 'V1004';