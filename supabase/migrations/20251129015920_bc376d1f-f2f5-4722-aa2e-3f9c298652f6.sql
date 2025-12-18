-- Eliminar la sobrecarga antigua de delete_sale_with_stock_release
-- que solo acepta un parámetro (sale_id_param uuid)
-- Esto resuelve el conflicto de resolución de funciones en PostgREST

DROP FUNCTION IF EXISTS public.delete_sale_with_stock_release(uuid);