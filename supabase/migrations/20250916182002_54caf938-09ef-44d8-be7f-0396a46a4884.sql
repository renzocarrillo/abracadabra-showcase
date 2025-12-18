-- Add detail_id_bsale column to ventas_detalle table
ALTER TABLE public.ventas_detalle 
ADD COLUMN detail_id_bsale bigint;