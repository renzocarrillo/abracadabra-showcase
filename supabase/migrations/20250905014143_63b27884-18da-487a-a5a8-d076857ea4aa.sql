-- Add urlPublicView column to traslados_internos table
ALTER TABLE traslados_internos 
ADD COLUMN url_public_view text;