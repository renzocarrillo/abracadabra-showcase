-- Add variant reference to shopify_product_images table
ALTER TABLE shopify_product_images
ADD COLUMN variant_sku TEXT REFERENCES variants(sku) ON DELETE CASCADE,
ADD COLUMN shopify_variant_id BIGINT;

-- Create index for variant lookups
CREATE INDEX idx_shopify_images_variant_sku ON shopify_product_images(variant_sku);
CREATE INDEX idx_shopify_images_shopify_variant_id ON shopify_product_images(shopify_variant_id);

-- Drop the unique constraint on shopify_image_id as multiple variants can use same image
ALTER TABLE shopify_product_images DROP CONSTRAINT IF EXISTS shopify_product_images_shopify_image_id_key;