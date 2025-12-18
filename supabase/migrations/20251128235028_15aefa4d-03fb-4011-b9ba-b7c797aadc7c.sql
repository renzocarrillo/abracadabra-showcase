-- Limpiar todos los shopify_product_id de productos
UPDATE "productosBsale" SET shopify_product_id = NULL WHERE shopify_product_id IS NOT NULL;

-- Limpiar todos los shopify_variant_id de variantes
UPDATE variants SET shopify_variant_id = NULL WHERE shopify_variant_id IS NOT NULL;