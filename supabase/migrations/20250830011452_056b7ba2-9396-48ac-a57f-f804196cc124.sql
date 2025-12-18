-- Add new columns to stockxbin table
ALTER TABLE public.stockxbin 
ADD COLUMN comprometido integer DEFAULT 0,
ADD COLUMN disponibles integer DEFAULT 0;

-- Rename cantidad column to en_existencia
ALTER TABLE public.stockxbin 
RENAME COLUMN cantidad TO en_existencia;