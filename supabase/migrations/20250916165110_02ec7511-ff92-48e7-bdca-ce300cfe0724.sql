-- Arreglar problemas de seguridad de las funciones de sincronización con Shopify

-- Función que se ejecuta cuando se crea un nuevo producto (con search_path seguro)
CREATE OR REPLACE FUNCTION notify_shopify_product_created()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Función que se ejecuta cuando se crea una nueva variante (con search_path seguro)
CREATE OR REPLACE FUNCTION notify_shopify_variant_created()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;