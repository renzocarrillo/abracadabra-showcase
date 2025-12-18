-- Añadir campo para indicar si se requiere guía de remisión
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS requiere_guia_remision boolean DEFAULT false;