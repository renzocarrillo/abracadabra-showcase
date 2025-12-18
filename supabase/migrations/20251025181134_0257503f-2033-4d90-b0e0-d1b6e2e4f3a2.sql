-- Add nombre column to conteo_productos
ALTER TABLE public.conteo_productos 
ADD COLUMN nombre TEXT;

-- Update existing records to have a default name
UPDATE public.conteo_productos 
SET nombre = 'Conteo ' || to_char(created_at, 'DD/MM/YYYY HH24:MI')
WHERE nombre IS NULL;