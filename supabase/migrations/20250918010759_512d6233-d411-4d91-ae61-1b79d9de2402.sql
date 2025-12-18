-- Add fields to pedidos table for BSale document information
ALTER TABLE public.pedidos 
ADD COLUMN url_public_view text,
ADD COLUMN serial_number text,
ADD COLUMN details_href text,
ADD COLUMN id_bsale_documento bigint;