-- Add is_general_image column to shopify_product_images table
ALTER TABLE shopify_product_images 
ADD COLUMN IF NOT EXISTS is_general_image BOOLEAN DEFAULT false;

-- Add index for faster queries on general images
CREATE INDEX IF NOT EXISTS idx_shopify_product_images_general 
ON shopify_product_images(shopify_product_id, is_general_image) 
WHERE variant_sku IS NULL;