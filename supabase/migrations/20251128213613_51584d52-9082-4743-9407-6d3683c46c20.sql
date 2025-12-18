-- Agregar search_path a funciones de sincronización con Shopify y función helper

-- Actualizar función notify_shopify_product_created con search_path
CREATE OR REPLACE FUNCTION notify_shopify_product_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM net.http_post(
        url := 'https://cflyvlkpbodtutyikfbk.supabase.co/functions/v1/sync-product-to-shopify',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('request.jwt.claims', true)::json->>'token'
        ),
        body := jsonb_build_object(
            'action', 'create_product',
            'productId', NEW.id
        )
    );
    
    RETURN NEW;
END;
$$;

-- Actualizar función notify_shopify_variant_created con search_path
CREATE OR REPLACE FUNCTION notify_shopify_variant_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW."idProductoBsale" IS NOT NULL THEN
        PERFORM net.http_post(
            url := 'https://cflyvlkpbodtutyikfbk.supabase.co/functions/v1/sync-product-to-shopify',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || current_setting('request.jwt.claims', true)::json->>'token'
            ),
            body := jsonb_build_object(
                'action', 'create_product',
                'productId', NEW."idProductoBsale"
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$;

-- Crear función helper para actualizar estadísticas de sesión de sincronización
CREATE OR REPLACE FUNCTION increment_shopify_sync_stats(
    p_session_id UUID,
    p_success BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_success THEN
        UPDATE shopify_sync_sessions
        SET 
            products_synced = products_synced + 1,
            updated_at = now()
        WHERE id = p_session_id;
    ELSE
        UPDATE shopify_sync_sessions
        SET 
            products_failed = products_failed + 1,
            updated_at = now()
        WHERE id = p_session_id;
    END IF;
END;
$$;