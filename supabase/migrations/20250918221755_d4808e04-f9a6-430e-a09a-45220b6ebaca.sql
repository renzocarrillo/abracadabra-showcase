-- Add missing transfers permissions
INSERT INTO public.permissions (name, display_name, description, category) VALUES
('manage_transfers', 'Gestionar Traslados', 'Crear, editar y gestionar traslados entre sucursales', 'transfers'),
('view_transfers', 'Ver Traslados', 'Ver lista de traslados entre sucursales', 'transfers');

-- Add more granular view/edit permissions where missing
INSERT INTO public.permissions (name, display_name, description, category) VALUES
('view_stock', 'Ver Stock', 'Ver estado del stock y movimientos', 'inventory'),
('edit_stock', 'Editar Stock', 'Modificar cantidades de stock', 'inventory'),
('view_bins', 'Ver Bins', 'Ver ubicaciones de productos', 'inventory'),
('edit_bins', 'Editar Bins', 'Modificar ubicaciones de productos', 'inventory'),
('view_products', 'Ver Productos', 'Ver catálogo de productos', 'products'),
('edit_products', 'Editar Productos', 'Modificar información de productos', 'products'),
('view_physical_stores', 'Ver Tiendas Físicas', 'Ver información de tiendas físicas', 'stores'),
('edit_physical_stores', 'Editar Tiendas Físicas', 'Modificar información de tiendas físicas', 'stores');

-- Update existing broad permissions descriptions to be more specific about their "manage" nature
UPDATE public.permissions SET 
  description = 'Gestión completa del inventario (crear, editar, eliminar)'
WHERE name = 'manage_inventory';

UPDATE public.permissions SET 
  description = 'Gestión completa de stock (entradas, salidas, movimientos)'
WHERE name = 'manage_stock';

UPDATE public.permissions SET 
  description = 'Gestión completa de ubicaciones (crear, editar, eliminar bins)'
WHERE name = 'manage_bins';

UPDATE public.permissions SET 
  description = 'Gestión completa de tiendas físicas (crear, editar, eliminar)'
WHERE name = 'manage_physical_stores';