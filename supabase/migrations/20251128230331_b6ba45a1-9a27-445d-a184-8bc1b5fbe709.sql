-- Agregar columnas para almacenar IDs de Shopify
ALTER TABLE "productosBsale" ADD COLUMN IF NOT EXISTS shopify_product_id bigint;
ALTER TABLE variants ADD COLUMN IF NOT EXISTS shopify_variant_id bigint;

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_productos_shopify_id ON "productosBsale"(shopify_product_id);
CREATE INDEX IF NOT EXISTS idx_variants_shopify_id ON variants(shopify_variant_id);

-- Comentarios para documentación
COMMENT ON COLUMN "productosBsale".shopify_product_id IS 'ID del producto en Shopify para sincronización bidireccional';
COMMENT ON COLUMN variants.shopify_variant_id IS 'ID de la variante en Shopify para sincronización bidireccional';