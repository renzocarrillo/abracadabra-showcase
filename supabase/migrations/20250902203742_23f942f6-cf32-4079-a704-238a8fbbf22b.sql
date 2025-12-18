-- Liberar stock comprometido del pedido PED-20250902-150438
-- Asignación 1: stock_id = 2fefca5c-2950-49a7-b597-f30e565f244b, cantidad = 6
UPDATE stockxbin 
SET 
    disponibles = disponibles + 6,
    comprometido = comprometido - 6,
    updated_at = now()
WHERE id = '2fefca5c-2950-49a7-b597-f30e565f244b';

-- Asignación 2: stock_id = 6a37b4ce-ce83-46d7-b214-25f056f629e8, cantidad = 2  
UPDATE stockxbin 
SET 
    disponibles = disponibles + 2,
    comprometido = comprometido - 2,
    updated_at = now()
WHERE id = '6a37b4ce-ce83-46d7-b214-25f056f629e8';

-- Eliminar asignaciones
DELETE FROM pedidos_asignaciones WHERE pedido_id = '23852b6a-15d5-42e6-9a06-0b9c2d0282c4';

-- Eliminar detalles del pedido
DELETE FROM pedidos_detalle WHERE pedido_id = '23852b6a-15d5-42e6-9a06-0b9c2d0282c4';

-- Eliminar el pedido principal
DELETE FROM pedidos WHERE id = '23852b6a-15d5-42e6-9a06-0b9c2d0282c4';