-- Remove Shopify product sync triggers and functions

-- Drop triggers first
DROP TRIGGER IF EXISTS trigger_shopify_product_sync ON productosBsale;
DROP TRIGGER IF EXISTS trigger_shopify_variant_sync ON variants;
DROP TRIGGER IF EXISTS update_products_updated_at ON productosBsale;

-- Drop the trigger functions
DROP FUNCTION IF EXISTS public.notify_shopify_product_created();
DROP FUNCTION IF EXISTS public.notify_shopify_variant_created();

-- Note: Keeping shopify-webhook edge function intact for receiving paid orders