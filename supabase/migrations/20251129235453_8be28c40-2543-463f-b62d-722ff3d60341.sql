-- Create table to cache Shopify product images
CREATE TABLE shopify_product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id BIGINT REFERENCES "productosBsale"(id) ON DELETE CASCADE,
  shopify_product_id BIGINT NOT NULL,
  shopify_image_id BIGINT NOT NULL,
  src TEXT NOT NULL,
  alt TEXT,
  position INTEGER DEFAULT 1,
  width INTEGER,
  height INTEGER,
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(shopify_image_id)
);

-- Create indexes for fast lookups
CREATE INDEX idx_shopify_images_product_id ON shopify_product_images(product_id);
CREATE INDEX idx_shopify_images_shopify_product_id ON shopify_product_images(shopify_product_id);

-- Enable RLS
ALTER TABLE shopify_product_images ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read images
CREATE POLICY "Allow authenticated users to read images"
  ON shopify_product_images
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can insert/update/delete
CREATE POLICY "Only admins can manage images"
  ON shopify_product_images
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );