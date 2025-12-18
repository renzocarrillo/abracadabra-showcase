-- Crear nuevos permisos más granulares
INSERT INTO public.permissions (name, display_name, description, category) VALUES
-- Bins permisos granulares
('view_bins', 'Ver Bins', 'Ver lista de ubicaciones y bins', 'bins'),
('create_bins', 'Crear Bins', 'Crear nuevas ubicaciones/bins', 'bins'),
('edit_bins_own', 'Editar Bins Propios', 'Editar bins creados por el usuario', 'bins'),
('delete_bins_own', 'Eliminar Bins Propios', 'Eliminar bins creados por el usuario', 'bins'),
('manage_bins_all', 'Gestionar Todos los Bins', 'Administración completa de todos los bins', 'bins'),
('move_products', 'Mover Productos', 'Mover productos entre bins', 'bins'),

-- Stock permisos granulares
('view_stock_read_only', 'Ver Stock (Solo Lectura)', 'Ver información de stock sin modificar', 'inventory'),

-- Productos congelados (mantener existentes pero asegurar que estén)
('view_frozen_products', 'Ver Productos Congelados', 'Ver lista de productos congelados', 'products'),
('manage_frozen_products', 'Gestionar Productos Congelados', 'Congelar y descongelar productos', 'products')

ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category;

-- Agregar columna created_by a la tabla bins si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'bins' 
                   AND column_name = 'created_by') THEN
        ALTER TABLE public.bins ADD COLUMN created_by uuid REFERENCES auth.users(id);
    END IF;
END $$;

-- Actualizar bins existentes para asignar un created_by por defecto (primer admin)
UPDATE public.bins 
SET created_by = (
    SELECT p.id 
    FROM public.profiles p 
    WHERE p.role = 'admin' 
    LIMIT 1
)
WHERE created_by IS NULL;

-- Eliminar políticas existentes de bins
DROP POLICY IF EXISTS "Authenticated users can read bins" ON public.bins;
DROP POLICY IF EXISTS "Authorized users can manage bins" ON public.bins;

-- Nuevas políticas RLS para bins
CREATE POLICY "Everyone can read bins" ON public.bins
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Users can create bins" ON public.bins  
FOR INSERT TO authenticated
WITH CHECK (user_has_permission('create_bins'::text) AND auth.uid() = created_by);

CREATE POLICY "Users can edit own bins or admins all" ON public.bins
FOR UPDATE TO authenticated  
USING (
    user_has_permission('manage_bins_all'::text) OR 
    (user_has_permission('edit_bins_own'::text) AND created_by = auth.uid())
);

CREATE POLICY "Users can delete own bins or admins all" ON public.bins
FOR DELETE TO authenticated
USING (
    user_has_permission('manage_bins_all'::text) OR 
    (user_has_permission('delete_bins_own'::text) AND created_by = auth.uid())
);

-- Actualizar políticas de stockxbin para lectura universal
DROP POLICY IF EXISTS "Admin can manage stock" ON public.stockxbin;

CREATE POLICY "Everyone can read stock" ON public.stockxbin
FOR SELECT TO authenticated  
USING (true);

CREATE POLICY "Authorized users can manage stock" ON public.stockxbin
FOR ALL TO authenticated
USING (user_has_permission('manage_stock'::text) OR user_has_role('admin'::text))
WITH CHECK (user_has_permission('manage_stock'::text) OR user_has_role('admin'::text));