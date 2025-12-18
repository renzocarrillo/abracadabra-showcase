-- Cancelar venta V1131 que ya tuvo su stock liberado
UPDATE ventas 
SET 
  estado = 'cancelada',
  motivo_eliminacion = 'Stock liberado mediante reset del sistema - Cancelada manualmente',
  fecha_eliminacion = NOW()
WHERE venta_id = 'V1131';