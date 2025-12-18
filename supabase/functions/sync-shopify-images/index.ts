import { createSupabaseClient } from '../_shared/supabase-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PRODUCTS_PER_CALL = 30; // Procesar 30 productos por llamada (reducido para evitar rate limiting)
const DELAY_BETWEEN_PRODUCTS_MS = 2000; // Rate limiting para Shopify API (0.5 req/s)

// Función de retry con backoff exponencial para manejar rate limiting de Shopify
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // Si es 429 (rate limit), esperar y reintentar
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter 
          ? parseInt(retryAfter) * 1000 
          : Math.pow(2, attempt + 1) * 1000; // Backoff exponencial: 2s, 4s, 8s
        
        console.log(`[IMAGE_SYNC] Rate limited (429), esperando ${waitTime}ms antes de reintentar (intento ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      // Para otros errores HTTP, retornar la respuesta
      return response;
    } catch (error) {
      lastError = error as Error;
      console.error(`[IMAGE_SYNC] Error en fetch (intento ${attempt + 1}/${maxRetries}):`, error);
      
      // Si no es el último intento, esperar con backoff exponencial
      if (attempt < maxRetries - 1) {
        const waitTime = Math.pow(2, attempt + 1) * 1000;
        console.log(`[IMAGE_SYNC] Esperando ${waitTime}ms antes de reintentar`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

interface ShopifyImage {
  id: number;
  product_id: number;
  position: number;
  src: string;
  alt: string | null;
  width: number;
  height: number;
  variant_ids?: number[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const {
      force_refresh = false,
      session_id: existingSessionId = null,
      start_offset = 0,
      started_by = null
    } = body;

    const supabase = createSupabaseClient();

    // 1. Crear o recuperar sesión
    let session;
    
    if (existingSessionId) {
      // Verificar que la sesión existe y no fue cancelada
      const { data: existingSession, error } = await supabase
        .from('shopify_image_sync_sessions')
        .select('*')
        .eq('id', existingSessionId)
        .single();

      if (error || !existingSession) {
        return new Response(
          JSON.stringify({ error: 'Sesión no encontrada' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (existingSession.status !== 'in_progress') {
        console.log('[IMAGE_SYNC] Sesión no está en progreso:', existingSession.status);
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: `Sesión ${existingSession.status}`,
            stopped: true
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      session = existingSession;
    } else {
      // Verificar si ya hay una sesión en progreso
      const { data: activeSession } = await supabase
        .from('shopify_image_sync_sessions')
        .select('id')
        .eq('status', 'in_progress')
        .gt('updated_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
        .maybeSingle();

      if (activeSession) {
        return new Response(
          JSON.stringify({ 
            error: 'Ya hay una sincronización en progreso',
            existing_session_id: activeSession.id 
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Limpiar sesiones zombie (más de 10 minutos sin actualización)
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      await supabase
        .from('shopify_image_sync_sessions')
        .update({ 
          status: 'failed', 
          error_message: 'Sesión abandonada - timeout' 
        })
        .eq('status', 'in_progress')
        .lt('updated_at', tenMinutesAgo);

      // Contar total de productos con shopify_product_id
      const { count, error: countError } = await supabase
        .from('productosBsale')
        .select('*', { count: 'exact', head: true })
        .not('shopify_product_id', 'is', null);

      if (countError) {
        throw new Error(`Error contando productos: ${countError.message}`);
      }

      const totalProducts = count || 0;
      const totalBatches = Math.ceil(totalProducts / PRODUCTS_PER_CALL);

      // Crear nueva sesión
      const { data: newSession, error: sessionError } = await supabase
        .from('shopify_image_sync_sessions')
        .insert({
          total_products: totalProducts,
          total_batches: totalBatches,
          current_batch: 1,
          force_refresh,
          started_by,
          status: 'in_progress'
        })
        .select()
        .single();

      if (sessionError) {
        throw new Error(`Error creando sesión: ${sessionError.message}`);
      }

      session = newSession;
      console.log('[IMAGE_SYNC] Nueva sesión creada:', session.id, 'Total productos:', totalProducts);
    }

    // 2. Obtener productos del batch actual
    const endOffset = start_offset + PRODUCTS_PER_CALL;
    const currentBatch = Math.floor(start_offset / PRODUCTS_PER_CALL) + 1;

    console.log(`[IMAGE_SYNC] Procesando batch ${currentBatch}/${session.total_batches} (offset ${start_offset}-${endOffset})`);

    // Lock de batch: actualizar current_batch atómicamente para prevenir duplicados
    const { data: lockedSession, error: lockError } = await supabase
      .from('shopify_image_sync_sessions')
      .update({ current_batch: currentBatch })
      .eq('id', session.id)
      .eq('status', 'in_progress')
      .select()
      .single();

    if (lockError || !lockedSession) {
      console.log('[IMAGE_SYNC] Batch ya siendo procesado por otra instancia o sesión cancelada');
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Batch ya en proceso o sesión no válida' 
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: products, error: productsError } = await supabase
      .from('productosBsale')
      .select('id, shopify_product_id, nombreProducto')
      .not('shopify_product_id', 'is', null)
      .range(start_offset, endOffset - 1);

    if (productsError) {
      throw new Error(`Error obteniendo productos: ${productsError.message}`);
    }

    if (!products || products.length === 0) {
      // No hay más productos, marcar como completada
      await supabase
        .from('shopify_image_sync_sessions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', session.id);

      console.log('[IMAGE_SYNC] Sesión completada:', session.id);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Sincronización completada',
          session_id: session.id,
          all_batches_completed: true
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const shopifyAccessToken = Deno.env.get('SHOPIFY_ACCESS_TOKEN');
    const shopifyStore = 'pelodeoso.myshopify.com';

    if (!shopifyAccessToken) {
      throw new Error('SHOPIFY_ACCESS_TOKEN not configured');
    }

    // 3. Procesar cada producto
    for (const product of products) {
      try {
        // Verificar caché solo si no es force_refresh
        if (!force_refresh) {
          const { data: existingCache } = await supabase
            .from('shopify_product_images')
            .select('cached_at')
            .eq('shopify_product_id', product.shopify_product_id)
            .order('cached_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existingCache) {
            const cacheAge = Date.now() - new Date(existingCache.cached_at).getTime();
            const twentyFourHours = 24 * 60 * 60 * 1000;

            if (cacheAge < twentyFourHours) {
              console.log(`[IMAGE_SYNC] Caché válido para producto ${product.nombreProducto}`);
              await supabase.rpc('increment_shopify_image_sync_stats', {
                p_session_id: session.id,
                p_skipped: 1,
                p_current_batch: currentBatch
              });
              continue;
            }
          }
        }

        // Obtener variantes del producto
        const { data: variants } = await supabase
          .from('variants')
          .select('sku, shopify_variant_id')
          .eq('idProductoBsale', product.id);

        // Llamar a Shopify API con retry automático
        const shopifyResponse = await fetchWithRetry(
          `https://${shopifyStore}/admin/api/2024-01/products/${product.shopify_product_id}/images.json`,
          {
            headers: {
              'X-Shopify-Access-Token': shopifyAccessToken,
              'Content-Type': 'application/json',
            },
          },
          3 // Máximo 3 reintentos
        );

        if (!shopifyResponse.ok) {
          console.error(`[IMAGE_SYNC] Error Shopify API para ${product.nombreProducto}:`, shopifyResponse.status);
          await supabase.rpc('increment_shopify_image_sync_stats', {
            p_session_id: session.id,
            p_failed: 1,
            p_current_batch: currentBatch
          });
          continue;
        }

        const shopifyData = await shopifyResponse.json();
        const images: ShopifyImage[] = shopifyData.images || [];

        if (images.length === 0) {
          console.log(`[IMAGE_SYNC] Sin imágenes para ${product.nombreProducto}`);
          await supabase.rpc('increment_shopify_image_sync_stats', {
            p_session_id: session.id,
            p_synced: 1,
            p_current_batch: currentBatch
          });
          continue;
        }

        // Eliminar caché viejo
        await supabase
          .from('shopify_product_images')
          .delete()
          .eq('shopify_product_id', product.shopify_product_id);

        // Construir nuevos registros de caché
        const imagesToCache: any[] = [];

        for (const img of images) {
          const variantIds = img.variant_ids || [];

          if (variantIds.length === 0) {
            // Imagen general del producto
            imagesToCache.push({
              product_id: product.id,
              shopify_product_id: product.shopify_product_id,
              shopify_image_id: img.id,
              src: img.src,
              alt: img.alt,
              position: img.position,
              width: img.width,
              height: img.height,
              variant_sku: null,
              shopify_variant_id: null,
              is_general_image: true,
              cached_at: new Date().toISOString(),
            });
          } else {
            // Imagen asociada a variantes específicas
            for (const variantId of variantIds) {
              const matchingVariant = variants?.find(v => v.shopify_variant_id === variantId);
              
              if (matchingVariant) {
                imagesToCache.push({
                  product_id: product.id,
                  shopify_product_id: product.shopify_product_id,
                  shopify_image_id: img.id,
                  src: img.src,
                  alt: img.alt,
                  position: img.position,
                  width: img.width,
                  height: img.height,
                  variant_sku: matchingVariant.sku,
                  shopify_variant_id: variantId,
                  is_general_image: false,
                  cached_at: new Date().toISOString(),
                });
              }
            }
          }
        }

        if (imagesToCache.length > 0) {
          const { error: insertError } = await supabase
            .from('shopify_product_images')
            .insert(imagesToCache);

          if (insertError) {
            console.error(`[IMAGE_SYNC] Error insertando caché para ${product.nombreProducto}:`, insertError);
            await supabase.rpc('increment_shopify_image_sync_stats', {
              p_session_id: session.id,
              p_failed: 1,
              p_current_batch: currentBatch
            });
          } else {
            console.log(`[IMAGE_SYNC] Cached ${imagesToCache.length} imágenes para ${product.nombreProducto}`);
            await supabase.rpc('increment_shopify_image_sync_stats', {
              p_session_id: session.id,
              p_synced: 1,
              p_current_batch: currentBatch
            });
          }
        } else {
          await supabase.rpc('increment_shopify_image_sync_stats', {
            p_session_id: session.id,
            p_synced: 1,
            p_current_batch: currentBatch
          });
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_PRODUCTS_MS));

      } catch (productError) {
        console.error(`[IMAGE_SYNC] Error procesando ${product.nombreProducto}:`, productError);
        await supabase.rpc('increment_shopify_image_sync_stats', {
          p_session_id: session.id,
          p_failed: 1,
          p_current_batch: currentBatch
        });
      }
    }

    // 4. Verificar si hay más productos para procesar
    const nextOffset = endOffset;
    const hasMoreProducts = nextOffset < session.total_products;

    if (hasMoreProducts) {
      // Verificar nuevamente que la sesión sigue en progreso antes de continuar
      const { data: updatedSession } = await supabase
        .from('shopify_image_sync_sessions')
        .select('status')
        .eq('id', session.id)
        .single();

      if (updatedSession?.status === 'in_progress') {
        console.log(`[IMAGE_SYNC] Auto-continuando con offset ${nextOffset}`);
        
        // Agregar delay de 2 segundos antes de auto-invocar para dar tiempo al sistema
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Usar EdgeRuntime.waitUntil para auto-continuar
        EdgeRuntime.waitUntil(
          supabase.functions.invoke('sync-shopify-images', {
            body: {
              session_id: session.id,
              start_offset: nextOffset,
              force_refresh
            }
          })
        );

        return new Response(
          JSON.stringify({
            success: true,
            session_id: session.id,
            batch_completed: currentBatch,
            next_offset: nextOffset,
            continuation_started: true
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        console.log('[IMAGE_SYNC] Sesión detenida, no se continúa:', updatedSession?.status);
      }
    } else {
      // Todos los batches completados
      await supabase
        .from('shopify_image_sync_sessions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', session.id);

      console.log('[IMAGE_SYNC] Todos los batches completados');
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Batch completado',
        session_id: session.id,
        batch_completed: currentBatch,
        all_batches_completed: !hasMoreProducts
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[IMAGE_SYNC] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
