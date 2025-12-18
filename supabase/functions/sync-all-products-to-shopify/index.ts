import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ShopifyProduct {
  title: string
  body_html: string
  vendor: string
  product_type: string
  status: string
  variants: ShopifyVariant[]
}

interface ShopifyVariant {
  sku: string
  price: string
  inventory_management: string
  inventory_quantity: number
  option1?: string
}

interface VariantWithProduct {
  id: string
  sku: string
  variante: string | null
  precio_base: number | null
  idProductoBsale: number
  shopify_variant_id: number | null
  productosBsale: {
    id: number
    nombreProducto: string | null
    nameProductType: string | null
    shopify_product_id: number | null
  }
}

function createSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  return createClient(supabaseUrl, supabaseKey)
}

async function syncProductToShopify(
  productId: number,
  variants: VariantWithProduct[],
  sessionId: string,
  batchNumber: number,
  shopifyAccessToken: string,
  shopifyStore: string,
  supabase: any
): Promise<boolean> {
  const productData = variants[0].productosBsale;
  const productName = productData.nombreProducto || `Product ${productId}`;
  const existingShopifyId = productData.shopify_product_id;

  try {
    console.log(`[BATCH_SYNC] Processing product ${productId}: ${productName} with ${variants.length} variant(s)`);

    // Preparar variantes para Shopify
    const shopifyVariants: ShopifyVariant[] = variants.map(v => ({
      sku: v.sku, // SKU real de la tabla variants
      price: v.precio_base?.toFixed(2) || '0.00',
      inventory_management: 'shopify',
      inventory_quantity: 0,
      option1: v.variante || 'Default',
    }));

    const shopifyProduct: ShopifyProduct = {
      title: productName,
      body_html: `Product from Bsale - Type: ${productData.nameProductType || 'N/A'}`,
      vendor: 'Abracadabra',
      product_type: productData.nameProductType || 'General',
      status: 'draft',
      variants: shopifyVariants,
    };

    let shopifyData;
    let method = 'POST';
    let url = `https://${shopifyStore}.myshopify.com/admin/api/2024-01/products.json`;

    // Si ya existe un shopify_product_id, actualizar en lugar de crear
    if (existingShopifyId) {
      method = 'PUT';
      url = `https://${shopifyStore}.myshopify.com/admin/api/2024-01/products/${existingShopifyId}.json`;
      console.log(`[BATCH_SYNC] Updating existing Shopify product ${existingShopifyId}`);
    }

    // Enviar a Shopify
    const shopifyResponse = await fetch(url, {
      method,
      headers: {
        'X-Shopify-Access-Token': shopifyAccessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ product: shopifyProduct }),
    });

    shopifyData = await shopifyResponse.json();

    if (!shopifyResponse.ok) {
      throw new Error(JSON.stringify(shopifyData.errors) || 'Shopify API error');
    }

    const returnedProduct = shopifyData.product;
    const returnedVariants = returnedProduct.variants || [];

    // Guardar shopify_product_id en productosBsale
    await supabase
      .from('productosBsale')
      .update({ shopify_product_id: returnedProduct.id })
      .eq('id', productId);

    // Guardar shopify_variant_id en cada variante (mapear por SKU)
    for (let i = 0; i < variants.length; i++) {
      const localVariant = variants[i];
      const shopifyVariant = returnedVariants.find((sv: any) => sv.sku === localVariant.sku);
      
      if (shopifyVariant) {
        await supabase
          .from('variants')
          .update({ shopify_variant_id: shopifyVariant.id })
          .eq('id', localVariant.id);
      }
    }

    console.log(`[BATCH_SYNC] ✅ Product ${productId} synced. Shopify ID: ${returnedProduct.id}, Variants: ${returnedVariants.length}`);

    // Log success
    await supabase.from('shopify_sync_details').insert({
      session_id: sessionId,
      product_id: productId,
      product_name: productName,
      shopify_product_id: returnedProduct.id,
      status: 'success',
      batch_number: batchNumber,
      synced_at: new Date().toISOString(),
    });

    await supabase.rpc('increment_shopify_sync_stats', {
      p_session_id: sessionId,
      p_success: true,
    });

    return true;
  } catch (error) {
    console.error(`[BATCH_SYNC] ❌ Error syncing product ${productId}:`, error);

    // Log failure
    await supabase.from('shopify_sync_details').insert({
      session_id: sessionId,
      product_id: productId,
      product_name: productName,
      shopify_product_id: null,
      status: 'failed',
      error_message: error.message || 'Unknown error',
      batch_number: batchNumber,
      synced_at: new Date().toISOString(),
    });

    await supabase.rpc('increment_shopify_sync_stats', {
      p_session_id: sessionId,
      p_success: false,
    });

    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createSupabaseClient();
  let sessionId: string | null = null;

  try {
    const shopifyAccessToken = Deno.env.get('SHOPIFY_ACCESS_TOKEN');
    const shopifyApiKey = Deno.env.get('SHOPIFY_API_KEY');
    const shopifyStore = Deno.env.get('SHOPIFY_STORE_NAME') || 'pelodeoso';

    if (!shopifyAccessToken || !shopifyApiKey) {
      throw new Error('Shopify credentials not configured');
    }

    console.log(`[BATCH_SYNC] Using Shopify store: ${shopifyStore}`);

    const body = await req.json();
    const trigger = body.trigger || 'manual';
    const startedBy = body.started_by || null;
    const existingSessionId = body.session_id || null;
    const startOffset = body.start_offset || 0;

    const PRODUCTS_PER_CALL = 100;

    console.log('[BATCH_SYNC] Request params:', { trigger, startedBy, existingSessionId, startOffset });

    // Limpiar sesiones zombie
    if (!existingSessionId) {
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      const { error: cleanupError } = await supabase
        .from('shopify_sync_sessions')
        .update({
          status: 'failed',
          error_message: 'Timeout - sesión abandonada por inactividad',
          last_error_at: new Date().toISOString(),
        })
        .eq('status', 'in_progress')
        .lt('updated_at', threeMinutesAgo);

      if (cleanupError) {
        console.error('[BATCH_SYNC] Error cleaning zombie sessions:', cleanupError);
      } else {
        console.log('[BATCH_SYNC] Zombie sessions cleaned');
      }
    }

    // Contar productos únicos (por idProductoBsale)
    const { data: uniqueProducts, error: countError } = await supabase
      .from('productosBsale')
      .select('id', { count: 'exact', head: false });

    if (countError) {
      throw new Error(`Failed to count products: ${countError.message}`);
    }

    const totalProducts = uniqueProducts?.length || 0;
    console.log(`[BATCH_SYNC] Total unique products: ${totalProducts}, Starting from offset: ${startOffset}`);

    // Obtener o crear sesión
    let session;
    if (existingSessionId) {
      const { data: existingSession, error: fetchError } = await supabase
        .from('shopify_sync_sessions')
        .select('*')
        .eq('id', existingSessionId)
        .single();

      if (fetchError || !existingSession) {
        throw new Error(`Failed to fetch existing session: ${fetchError?.message}`);
      }

      session = existingSession;
      sessionId = session.id;
      console.log(`[BATCH_SYNC] Continuing session: ${sessionId}`);
    } else {
      const { data: newSession, error: sessionError } = await supabase
        .from('shopify_sync_sessions')
        .insert({
          status: 'in_progress',
          total_products: totalProducts,
          total_batches: Math.ceil(totalProducts / PRODUCTS_PER_CALL),
          current_batch: 0,
          products_synced: 0,
          products_failed: 0,
          started_by: startedBy,
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (sessionError || !newSession) {
        throw new Error(`Failed to create sync session: ${sessionError?.message}`);
      }

      session = newSession;
      sessionId = session.id;
      console.log(`[BATCH_SYNC] New session created: ${sessionId}`);
    }

    // Procesar micro-lote de productos
    const endOffset = Math.min(startOffset + PRODUCTS_PER_CALL, totalProducts);
    const currentBatch = Math.floor(startOffset / PRODUCTS_PER_CALL) + 1;
    const totalBatches = Math.ceil(totalProducts / PRODUCTS_PER_CALL);

    console.log(`[BATCH_SYNC] Processing micro-batch ${currentBatch}/${totalBatches} (products ${startOffset + 1} to ${endOffset})`);

    // Obtener IDs de productos del lote
    const productIds = uniqueProducts.slice(startOffset, endOffset).map((p: any) => p.id);

    // Obtener todas las variantes de estos productos con su información
    const { data: variants, error: variantsError } = await supabase
      .from('variants')
      .select(`
        id,
        sku,
        variante,
        precio_base,
        idProductoBsale,
        shopify_variant_id,
        productosBsale:idProductoBsale (
          id,
          nombreProducto,
          nameProductType,
          shopify_product_id
        )
      `)
      .in('idProductoBsale', productIds);

    if (variantsError) {
      throw new Error(`Failed to fetch variants: ${variantsError.message}`);
    }

    // Agrupar variantes por producto
    const productMap = new Map<number, VariantWithProduct[]>();
    for (const variant of variants || []) {
      const productId = variant.idProductoBsale;
      if (!productMap.has(productId)) {
        productMap.set(productId, []);
      }
      productMap.get(productId)!.push(variant as VariantWithProduct);
    }

    let successCount = 0;
    let failCount = 0;

    // Procesar cada producto con sus variantes
    // Agregar delay entre productos para respetar límite de Shopify (2 llamadas/segundo)
    const productEntries = Array.from(productMap.entries());
    for (let i = 0; i < productEntries.length; i++) {
      const [productId, productVariants] = productEntries[i];
      
      const success = await syncProductToShopify(
        productId,
        productVariants,
        sessionId,
        currentBatch,
        shopifyAccessToken,
        shopifyStore,
        supabase
      );

      if (success) {
        successCount++;
      } else {
        failCount++;
      }

      // Delay de 600ms entre productos para respetar límite de 2 llamadas/segundo
      if (i < productEntries.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 600));
      }
    }

    // Actualizar progreso de la sesión
    await supabase
      .from('shopify_sync_sessions')
      .update({
        current_batch: currentBatch,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    console.log(`[BATCH_SYNC] Batch ${currentBatch}/${totalBatches} completed. Success: ${successCount}, Failed: ${failCount}`);

    // Si quedan más productos, verificar que la sesión no fue cancelada antes de continuar
    if (endOffset < totalProducts) {
      // Verificar estado actual de la sesión
      const { data: currentSession, error: sessionCheckError } = await supabase
        .from('shopify_sync_sessions')
        .select('status')
        .eq('id', sessionId)
        .single();

      if (sessionCheckError) {
        console.error('[BATCH_SYNC] Error checking session status:', sessionCheckError);
      } else if (currentSession?.status !== 'in_progress') {
        console.log(`[BATCH_SYNC] Session ${sessionId} is no longer in progress (status: ${currentSession?.status}). Stopping auto-continuation.`);
        return new Response(
          JSON.stringify({
            success: true,
            session_id: sessionId,
            batch_completed: currentBatch,
            total_batches: totalBatches,
            products_processed_this_batch: successCount + failCount,
            stopped_by_user: true,
            message: 'Sincronización detenida por el usuario',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        );
      }

      console.log(`[BATCH_SYNC] More products remaining. Auto-invoking next batch starting at offset ${endOffset}`);
      
      // Delay adicional entre batches para dar más espacio
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      EdgeRuntime.waitUntil(
        supabase.functions.invoke('sync-all-products-to-shopify', {
          body: {
            session_id: sessionId,
            start_offset: endOffset,
            trigger: 'auto-continuation',
          },
        })
      );

      return new Response(
        JSON.stringify({
          success: true,
          session_id: sessionId,
          batch_completed: currentBatch,
          total_batches: totalBatches,
          products_processed_this_batch: successCount + failCount,
          next_offset: endOffset,
          continuation_started: true,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    } else {
      // Marcar sesión como completada
      await supabase
        .from('shopify_sync_sessions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId);

      console.log(`[BATCH_SYNC] All products synced. Session ${sessionId} completed.`);

      return new Response(
        JSON.stringify({
          success: true,
          session_id: sessionId,
          total_products: totalProducts,
          all_batches_completed: true,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }
  } catch (error) {
    console.error('[BATCH_SYNC] Fatal error:', error);

    if (sessionId) {
      await supabase
        .from('shopify_sync_sessions')
        .update({
          status: 'failed',
          error_message: error.message,
          last_error_at: new Date().toISOString(),
        })
        .eq('id', sessionId);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
