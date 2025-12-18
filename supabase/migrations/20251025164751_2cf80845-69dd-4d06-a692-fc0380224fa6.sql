-- Agregar 'picking_libre' como tipo válido en order_signatures

-- Eliminar el constraint existente que limita order_type
ALTER TABLE public.order_signatures
DROP CONSTRAINT IF EXISTS order_signatures_order_type_check;

-- Agregar nuevo constraint que incluye 'picking_libre'
ALTER TABLE public.order_signatures
ADD CONSTRAINT order_signatures_order_type_check 
CHECK (order_type IN ('pedido', 'venta', 'picking_libre'));