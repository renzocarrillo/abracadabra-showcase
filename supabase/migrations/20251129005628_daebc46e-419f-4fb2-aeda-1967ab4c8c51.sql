-- Eliminar triggers de sincronización automática con Shopify
DROP TRIGGER IF EXISTS trigger_shopify_product_sync ON public."productosBsale";
DROP TRIGGER IF EXISTS trigger_shopify_variant_sync ON public.variants;

-- Eliminar las funciones de notificación que causaban el error
DROP FUNCTION IF EXISTS public.notify_shopify_product_created();
DROP FUNCTION IF EXISTS public.notify_shopify_variant_created();

-- Nota: Se mantiene increment_shopify_sync_stats() para las sincronizaciones masivas manuales