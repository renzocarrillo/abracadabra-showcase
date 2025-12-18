-- Corregir variantes duplicadas en producto 7365 (Suéter Soft Layers Noor)
-- Usar SKU como identificador único

-- Cambiar MARRON T-M a MARRON T-L
UPDATE variants 
SET variante = 'MARRON T-L'
WHERE sku = '1062371-11'
  AND variante = 'MARRON T-M';

-- Cambiar CAMELL T-M a CAMELL T-L
UPDATE variants 
SET variante = 'CAMELL T-L'
WHERE sku = '1062371-12'
  AND variante = 'CAMELL T-M';