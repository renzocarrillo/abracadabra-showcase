import { createSupabaseClient } from '../_shared/supabase-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ShopifyProduct {
  id?: number;
  title: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  variants: ShopifyVariant[];
  status?: string;
}

interface ShopifyVariant {
  id?: number;
  title: string;
  price: string;
  sku: string;
  inventory_management?: string;
  inventory_policy?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Declare variables outside try-catch for access in error handler
  let productId: number | null = null;
  let sessionId: string | null = null;
  let productName: string | null = null;
  const supabase = createSupabaseClient();

  try {
    const shopifyAccessToken = Deno.env.get('SHOPIFY_ACCESS_TOKEN');
    const shopifyApiKey = Deno.env.get('SHOPIFY_API_KEY');

    if (!shopifyAccessToken || !shopifyApiKey) {
      throw new Error('Shopify credentials not configured');
    }

    const body = await req.json();
    productId = body.productId;
    sessionId = body.sessionId;

    console.log('[SHOPIFY_SYNC] Starting sync:', { productId, sessionId });

    // Get product data from Bsale
    const { data: product, error: productError } = await supabase
      .from('productosBsale')
      .select('*, variants(*)')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      console.error('[SHOPIFY_SYNC] Product not found:', productError);
      throw new Error('Product not found in database');
    }

    productName = product.nombreProducto || `Product ${productId}`;
    console.log('[SHOPIFY_SYNC] Product found:', productName);

    // Prepare Shopify product data
    const shopifyProduct: ShopifyProduct = {
      title: productName,
      body_html: `Product from Bsale - Type: ${product.nameProductType || 'N/A'}`,
      vendor: 'Abracadabra',
      product_type: product.nameProductType || 'General',
      status: 'active',
      variants: (product.variants || []).map((variant: any) => ({
        title: variant.description || variant.sku,
        price: '0.00', // Price from Bsale or default
        sku: variant.sku,
        inventory_management: 'shopify',
        inventory_policy: 'deny',
      })),
    };

    // If no variants, add a default one
    if (shopifyProduct.variants.length === 0) {
      shopifyProduct.variants.push({
        title: 'Default',
        price: '0.00',
        sku: `PROD-${productId}`,
        inventory_management: 'shopify',
        inventory_policy: 'deny',
      });
    }

    console.log('[SHOPIFY_SYNC] Sending to Shopify:', {
      title: shopifyProduct.title,
      variants: shopifyProduct.variants.length,
    });

    // Create product in Shopify
    const shopifyResponse = await fetch(
      `https://pelodeoso.myshopify.com/admin/api/2024-01/products.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': shopifyAccessToken,
        },
        body: JSON.stringify({ product: shopifyProduct }),
      }
    );

    const shopifyData = await shopifyResponse.json();

    if (!shopifyResponse.ok) {
      console.error('[SHOPIFY_SYNC] Shopify API error:', shopifyData);
      throw new Error(
        `Shopify API error: ${shopifyData.errors ? JSON.stringify(shopifyData.errors) : 'Unknown error'}`
      );
    }

    console.log('[SHOPIFY_SYNC] Product created in Shopify:', shopifyData.product?.id);

    // Log success to sync details if session exists
    if (sessionId) {
      await supabase.from('shopify_sync_details').insert({
        session_id: sessionId,
        product_id: productId,
        product_name: productName,
        shopify_product_id: shopifyData.product?.id,
        status: 'success',
        batch_number: 1,
        synced_at: new Date().toISOString(),
      });

      // Update session stats
      await supabase.rpc('increment_shopify_sync_stats', {
        p_session_id: sessionId,
        p_success: true,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        shopify_product_id: shopifyData.product?.id,
        message: 'Product synced successfully to Shopify',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('[SHOPIFY_SYNC] Error:', error);

    // Log failure to database if we have sessionId
    if (sessionId) {
      try {
        await supabase.from('shopify_sync_details').insert({
          session_id: sessionId,
          product_id: productId,
          product_name: productName || `Product ${productId || 'unknown'}`,
          shopify_product_id: null,
          status: 'failed',
          error_message: error.message || 'Unknown error',
          batch_number: 1,
          synced_at: new Date().toISOString(),
        });

        await supabase.rpc('increment_shopify_sync_stats', {
          p_session_id: sessionId,
          p_success: false,
        });
      } catch (logError) {
        console.error('[SHOPIFY_SYNC] Failed to log error to database:', logError);
      }
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
