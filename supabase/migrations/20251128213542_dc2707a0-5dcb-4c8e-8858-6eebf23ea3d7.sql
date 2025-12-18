-- Recrear infraestructura de sincronización de productos con Shopify

-- ================================================
-- TABLAS DE SINCRONIZACIÓN
-- ================================================

-- Crear tabla para rastrear sesiones de sincronización con Shopify
CREATE TABLE IF NOT EXISTS public.shopify_sync_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed', 'paused')),
  total_products INTEGER NOT NULL,
  total_batches INTEGER NOT NULL,
  current_batch INTEGER NOT NULL DEFAULT 0,
  products_synced INTEGER NOT NULL DEFAULT 0,
  products_failed INTEGER NOT NULL DEFAULT 0,
  started_by UUID REFERENCES auth.users(id),
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  last_error_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Crear tabla para rastrear detalles de productos sincronizados
CREATE TABLE IF NOT EXISTS public.shopify_sync_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.shopify_sync_sessions(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL,
  product_name TEXT NOT NULL,
  shopify_product_id BIGINT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed', 'skipped')),
  error_message TEXT,
  batch_number INTEGER NOT NULL,
  synced_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ================================================
-- ÍNDICES
-- ================================================

CREATE INDEX IF NOT EXISTS idx_shopify_sync_sessions_status ON public.shopify_sync_sessions(status);
CREATE INDEX IF NOT EXISTS idx_shopify_sync_sessions_started_at ON public.shopify_sync_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_shopify_sync_details_session_id ON public.shopify_sync_details(session_id);
CREATE INDEX IF NOT EXISTS idx_shopify_sync_details_status ON public.shopify_sync_details(status);
CREATE INDEX IF NOT EXISTS idx_shopify_sync_details_product_id ON public.shopify_sync_details(product_id);

-- ================================================
-- RLS POLICIES
-- ================================================

ALTER TABLE public.shopify_sync_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopify_sync_details ENABLE ROW LEVEL SECURITY;

-- Admins pueden ver todas las sesiones
CREATE POLICY "Admins can read all sync sessions"
  ON public.shopify_sync_sessions
  FOR SELECT
  USING (user_has_role('admin'));

-- Solo admins pueden crear sesiones
CREATE POLICY "Admins can create sync sessions"
  ON public.shopify_sync_sessions
  FOR INSERT
  WITH CHECK (user_has_role('admin') AND started_by = auth.uid());

-- Solo admins pueden actualizar sesiones
CREATE POLICY "Admins can update sync sessions"
  ON public.shopify_sync_sessions
  FOR UPDATE
  USING (user_has_role('admin'));

-- Admins pueden ver todos los detalles
CREATE POLICY "Admins can read all sync details"
  ON public.shopify_sync_details
  FOR SELECT
  USING (user_has_role('admin'));

-- Sistema puede insertar detalles
CREATE POLICY "System can insert sync details"
  ON public.shopify_sync_details
  FOR INSERT
  WITH CHECK (true);

-- Sistema puede actualizar detalles
CREATE POLICY "System can update sync details"
  ON public.shopify_sync_details
  FOR UPDATE
  USING (true);

-- ================================================
-- FUNCIONES DE NOTIFICACIÓN
-- ================================================

-- Función que se ejecuta cuando se crea un nuevo producto
CREATE OR REPLACE FUNCTION notify_shopify_product_created()
RETURNS TRIGGER AS $$
BEGIN
    -- Llamar a la función edge para sincronizar el producto con Shopify
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función que se ejecuta cuando se crea una nueva variante
CREATE OR REPLACE FUNCTION notify_shopify_variant_created()
RETURNS TRIGGER AS $$
BEGIN
    -- Si la variante tiene un idProductoBsale asociado, sincronizar el producto completo
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- TRIGGERS
-- ================================================

-- Crear trigger para productos nuevos
DROP TRIGGER IF EXISTS trigger_shopify_product_sync ON public."productosBsale";
CREATE TRIGGER trigger_shopify_product_sync
    AFTER INSERT ON public."productosBsale"
    FOR EACH ROW
    EXECUTE FUNCTION notify_shopify_product_created();

-- Crear trigger para variantes nuevas
DROP TRIGGER IF EXISTS trigger_shopify_variant_sync ON public.variants;
CREATE TRIGGER trigger_shopify_variant_sync
    AFTER INSERT ON public.variants
    FOR EACH ROW
    EXECUTE FUNCTION notify_shopify_variant_created();