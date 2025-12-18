-- Temporary fix: Mark V1020 as completed with dispatch guide emitted
UPDATE ventas 
SET 
  estado = 'archivado',
  guia_remision = true,
  requiere_guia_remision = true,
  updated_at = now()
WHERE venta_id = 'V1020';