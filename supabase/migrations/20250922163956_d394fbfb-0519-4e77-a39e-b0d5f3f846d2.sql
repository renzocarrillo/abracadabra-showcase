-- Add permission for signing orders
INSERT INTO public.permissions (name, display_name, description, category)
VALUES ('sign_orders', 'Firmar Pedidos', 'Permite firmar revisiones de pedidos y ventas completados', 'orders')
ON CONFLICT (name) DO NOTHING;

-- Grant sign_orders permission to supervisor and admin user types
INSERT INTO public.user_type_permissions (user_type_id, permission_id)
SELECT ut.id, p.id
FROM public.user_types ut
CROSS JOIN public.permissions p
WHERE ut.name IN ('supervisor', 'admin') 
  AND p.name = 'sign_orders'
ON CONFLICT (user_type_id, permission_id) DO NOTHING;