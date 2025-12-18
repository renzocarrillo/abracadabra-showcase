-- Drop tables related to product sync (not needed anymore)
-- We keep the webhook functionality for receiving orders

-- Drop shopify sync tables
DROP TABLE IF EXISTS public.shopify_sync_details CASCADE;
DROP TABLE IF EXISTS public.shopify_sync_sessions CASCADE;

-- Note: We're keeping the webhook functionality intact
-- The shopify-webhook and setup-shopify-webhook functions will continue working
-- to receive orders from Shopify