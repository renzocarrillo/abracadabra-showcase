-- Crear triggers para sincronizar productos con Shopify automáticamente

-- Función que se ejecuta cuando se crea un nuevo producto
CREATE OR REPLACE FUNCTION notify_shopify_product_created()
RETURNS TRIGGER AS $$
BEGIN
    -- Llamar a la función edge para sincronizar el producto con Shopify
    PERFORM net.http_post(
        url := 'https://cflyvlkpbodtutyikfbk.supabase.co/functions/v1/sync-product-to-shopify',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := json_build_object(
            'action', 'create_product',
            'productId', NEW.id
        )::jsonb
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Función que se ejecuta cuando se crea una nueva variante
CREATE OR REPLACE FUNCTION notify_shopify_variant_created()
RETURNS TRIGGER AS $$
BEGIN
    -- Si la variante tiene un idProductoBsale asociado, sincronizar el producto completo
    IF NEW."idProductoBsale" IS NOT NULL THEN
        PERFORM net.http_post(
            url := 'https://cflyvlkpbodtutyikfbk.supabase.co/functions/v1/sync-product-to-shopify',
            headers := '{"Content-Type": "application/json"}'::jsonb,
            body := json_build_object(
                'action', 'create_product',
                'productId', NEW."idProductoBsale"
            )::jsonb
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger para productos nuevos
CREATE OR REPLACE TRIGGER trigger_shopify_product_sync
    AFTER INSERT ON public."productosBsale"
    FOR EACH ROW
    EXECUTE FUNCTION notify_shopify_product_created();

-- Crear trigger para variantes nuevas
CREATE OR REPLACE TRIGGER trigger_shopify_variant_sync
    AFTER INSERT ON public.variants
    FOR EACH ROW
    EXECUTE FUNCTION notify_shopify_variant_created();