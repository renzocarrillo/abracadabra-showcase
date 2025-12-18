import { createSupabaseClient } from '../_shared/supabase-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { variant_sku } = await req.json();

    if (!variant_sku) {
      return new Response(
        JSON.stringify({ error: 'variant_sku es requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createSupabaseClient();

    // Get shopify_variant_id and shopify_product_id from variants
    const { data: variantData, error: variantError } = await supabase
      .from('variants')
      .select('shopify_variant_id, idProductoBsale')
      .eq('sku', variant_sku)
      .single();

    if (variantError || !variantData?.shopify_variant_id) {
      console.log('Variant not synced with Shopify:', variant_sku);
      return new Response(
        JSON.stringify({ 
          images: [], 
          message: 'Variante no sincronizada con Shopify' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get shopify_product_id
    const { data: productData, error: productError } = await supabase
      .from('productosBsale')
      .select('shopify_product_id')
      .eq('id', variantData.idProductoBsale)
      .single();

    if (productError || !productData?.shopify_product_id) {
      console.log('Product not synced with Shopify:', variantData.idProductoBsale);
      return new Response(
        JSON.stringify({ 
          images: [], 
          message: 'Producto no sincronizado con Shopify' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const shopifyProductId = productData.shopify_product_id;
    const shopifyVariantId = variantData.shopify_variant_id;
    const cacheExpiry = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // 1. Check cache for variant-specific images
    const { data: variantCache, error: variantCacheError } = await supabase
      .from('shopify_product_images')
      .select('*')
      .eq('variant_sku', variant_sku)
      .gte('cached_at', cacheExpiry)
      .order('position', { ascending: true });

    if (!variantCacheError && variantCache && variantCache.length > 0) {
      console.log('Returning cached variant images for:', variant_sku);
      return new Response(
        JSON.stringify({ 
          images: variantCache, 
          cached: true,
          image_type: 'variant'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Fallback: Check cache for general product images
    const { data: generalCache, error: generalCacheError } = await supabase
      .from('shopify_product_images')
      .select('*')
      .eq('shopify_product_id', shopifyProductId)
      .is('variant_sku', null)
      .eq('is_general_image', true)
      .gte('cached_at', cacheExpiry)
      .order('position', { ascending: true });

    if (!generalCacheError && generalCache && generalCache.length > 0) {
      console.log('Returning cached general images for product:', shopifyProductId);
      return new Response(
        JSON.stringify({ 
          images: generalCache, 
          cached: true,
          image_type: 'general'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. No cache found - Fetch from Shopify API
    const shopifyAccessToken = Deno.env.get('SHOPIFY_ACCESS_TOKEN');
    const shopifyStore = 'pelodeoso.myshopify.com';

    if (!shopifyAccessToken) {
      throw new Error('SHOPIFY_ACCESS_TOKEN not configured');
    }

    console.log('Fetching images from Shopify for product:', shopifyProductId);
    
    const shopifyResponse = await fetch(
      `https://${shopifyStore}/admin/api/2024-01/products/${shopifyProductId}/images.json`,
      {
        headers: {
          'X-Shopify-Access-Token': shopifyAccessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!shopifyResponse.ok) {
      const errorText = await shopifyResponse.text();
      console.error('Shopify API error:', errorText);
      return new Response(
        JSON.stringify({ 
          images: [], 
          error: 'Error al obtener imágenes de Shopify' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const shopifyData = await shopifyResponse.json();
    const allImages: ShopifyImage[] = shopifyData.images || [];

    // Filter images that are associated with this variant
    let variantImages = allImages.filter((img: any) => {
      const variantIds = img.variant_ids || [];
      return variantIds.length > 0 && variantIds.includes(shopifyVariantId);
    });

    let imageType = 'variant';

    // Fallback: If no variant-specific images, use general product images
    if (variantImages.length === 0) {
      variantImages = allImages.filter((img: any) => {
        const variantIds = img.variant_ids || [];
        return variantIds.length === 0;
      });
      imageType = 'general';
      console.log('No variant-specific images, using general images for:', variant_sku);
    }

    if (variantImages.length === 0) {
      console.log('No images found for variant:', variant_sku, 'in Shopify');
      return new Response(
        JSON.stringify({ 
          images: [], 
          message: 'No hay imágenes disponibles para esta variante',
          image_type: 'none'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Cache images in database
    const imagesToCache = variantImages.map((img) => ({
      product_id: variantData.idProductoBsale,
      shopify_product_id: shopifyProductId,
      shopify_variant_id: imageType === 'variant' ? shopifyVariantId : null,
      variant_sku: imageType === 'variant' ? variant_sku : null,
      shopify_image_id: img.id,
      src: img.src,
      alt: img.alt,
      position: img.position,
      width: img.width,
      height: img.height,
      is_general_image: imageType === 'general',
      cached_at: new Date().toISOString(),
    }));

    // Delete old cache for this variant (if variant-specific)
    if (imageType === 'variant') {
      await supabase
        .from('shopify_product_images')
        .delete()
        .eq('variant_sku', variant_sku);
    }

    // Insert new cache
    const { error: insertError } = await supabase
      .from('shopify_product_images')
      .insert(imagesToCache);

    if (insertError) {
      console.error('Error caching images:', insertError);
    } else {
      console.log('Cached', variantImages.length, imageType, 'images for variant:', variant_sku);
    }

    return new Response(
      JSON.stringify({ 
        images: imagesToCache, 
        cached: false,
        image_type: imageType
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in get-shopify-product-images:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
