-- Archivar el pedido que ya fue procesado
UPDATE pedidos 
SET estado = 'archivado', updated_at = now() 
WHERE pedido_id = 'PED-20250905-202222';