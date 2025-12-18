-- Consolidar y eliminar duplicados en picking_libre_items
-- Paso 1: Identificar y consolidar duplicados
WITH duplicates AS (
  SELECT 
    session_id,
    sku,
    bin_code,
    COUNT(*) as count,
    SUM(quantity) as total_quantity
  FROM picking_libre_items
  GROUP BY session_id, sku, bin_code
  HAVING COUNT(*) > 1
),
to_keep AS (
  SELECT DISTINCT ON (pli.session_id, pli.sku, pli.bin_code)
    pli.id,
    pli.session_id,
    pli.sku,
    pli.bin_code,
    d.total_quantity
  FROM picking_libre_items pli
  INNER JOIN duplicates d 
    ON pli.session_id = d.session_id 
    AND pli.sku = d.sku 
    AND pli.bin_code = d.bin_code
  ORDER BY pli.session_id, pli.sku, pli.bin_code, pli.scanned_at DESC
)
-- Actualizar el registro que vamos a mantener con la cantidad total
UPDATE picking_libre_items pli
SET quantity = tk.total_quantity
FROM to_keep tk
WHERE pli.id = tk.id;

-- Paso 2: Eliminar los duplicados (mantener solo el actualizado)
WITH duplicates AS (
  SELECT 
    session_id,
    sku,
    bin_code,
    COUNT(*) as count
  FROM picking_libre_items
  GROUP BY session_id, sku, bin_code
  HAVING COUNT(*) > 1
),
to_keep AS (
  SELECT DISTINCT ON (pli.session_id, pli.sku, pli.bin_code)
    pli.id
  FROM picking_libre_items pli
  INNER JOIN duplicates d 
    ON pli.session_id = d.session_id 
    AND pli.sku = d.sku 
    AND pli.bin_code = d.bin_code
  ORDER BY pli.session_id, pli.sku, pli.bin_code, pli.scanned_at DESC
)
DELETE FROM picking_libre_items
WHERE id NOT IN (SELECT id FROM to_keep)
AND (session_id, sku, bin_code) IN (
  SELECT session_id, sku, bin_code FROM duplicates
);

-- Paso 3: Agregar constraint único
ALTER TABLE picking_libre_items 
DROP CONSTRAINT IF EXISTS unique_session_sku_bin;

ALTER TABLE picking_libre_items 
ADD CONSTRAINT unique_session_sku_bin 
UNIQUE (session_id, sku, bin_code);