import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { sessionId } = await req.json();

    console.log('Restoring stock for failed picking session:', sessionId);

    // Get all items from the session
    const { data: items, error: itemsError } = await supabase
      .from('picking_libre_items')
      .select('sku, quantity, bin_code')
      .eq('session_id', sessionId);

    if (itemsError) throw itemsError;

    if (!items || items.length === 0) {
      throw new Error('No items found for this session');
    }

    // Aggregate quantities by SKU and bin
    const aggregated = items.reduce((acc: any, item) => {
      const key = `${item.sku}-${item.bin_code}`;
      if (!acc[key]) {
        acc[key] = {
          sku: item.sku,
          bin: item.bin_code,
          quantity: 0
        };
      }
      acc[key].quantity += item.quantity;
      return acc;
    }, {});

    // Restore stock for each SKU/bin combination
    const results = [];
    for (const key in aggregated) {
      const { sku, bin, quantity } = aggregated[key];
      
      const { data: result, error } = await supabase
        .rpc('restore_lost_stock', {
          p_sku: sku,
          p_bin: bin,
          p_quantity: quantity
        });

      if (error) {
        console.error(`Error restoring stock for ${sku} in ${bin}:`, error);
        results.push({ sku, bin, quantity, success: false, error: error.message });
      } else {
        console.log(`Restored ${quantity} units of ${sku} in ${bin}`);
        results.push({ sku, bin, quantity, success: true, result });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Stock restoration completed',
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in restore-picking-stock:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
