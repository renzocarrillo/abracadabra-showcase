import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface BsaleDetail {
  variant: {
    code: string;
  };
  quantity: number;
  unitCost?: number;
}

serve(async (req) => {
  console.log('Backfill stock movement details function called')
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Check authentication and admin permissions
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type_id, user_types!inner(is_admin)')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.user_types?.is_admin === true;

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Only administrators can run backfill operations' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const bsaleAccessToken = Deno.env.get('BSALE_ACCESS_TOKEN');
    if (!bsaleAccessToken) {
      return new Response(
        JSON.stringify({ error: 'BSale access token not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role for bulk operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const stats = {
      receptions_processed: 0,
      receptions_failed: 0,
      consumptions_processed: 0,
      consumptions_failed: 0,
      details_inserted: 0
    };

    // Process stock receptions
    console.log('Starting to process stock receptions...');
    const { data: receptions } = await supabaseAdmin
      .from('stock_receptions')
      .select('id, document_number, bsale_response')
      .not('bsale_response', 'is', null);

    if (receptions) {
      for (const reception of receptions) {
        try {
          // Check if already has details
          const { count } = await supabaseAdmin
            .from('stock_reception_details')
            .select('*', { count: 'exact', head: true })
            .eq('reception_id', reception.id);

          if (count && count > 0) {
            console.log(`Reception ${reception.document_number} already has details, skipping`);
            continue;
          }

          const bsaleResponse = reception.bsale_response as any;
          const bsaleId = bsaleResponse?.id;

          if (!bsaleId) {
            console.log(`Reception ${reception.document_number} has no BSale ID, skipping`);
            stats.receptions_failed++;
            continue;
          }

          // Fetch details from BSale API
          console.log(`Fetching details for reception ${reception.document_number} (BSale ID: ${bsaleId})`);
          const detailsUrl = `https://api.bsale.io/v1/stocks/receptions/${bsaleId}/details.json`;
          const detailsResponse = await fetch(detailsUrl, {
            headers: { 'access_token': bsaleAccessToken }
          });

          if (!detailsResponse.ok) {
            console.error(`Failed to fetch details for reception ${reception.document_number}`);
            stats.receptions_failed++;
            continue;
          }

          const detailsData = await detailsResponse.json();
          const items = detailsData?.items || [];

          if (items.length === 0) {
            console.log(`No details found for reception ${reception.document_number}`);
            stats.receptions_failed++;
            continue;
          }

          // Get product info for all SKUs
          const skus = items.map((item: BsaleDetail) => item.variant.code);
          const { data: variants } = await supabaseAdmin
            .from('variants')
            .select('sku, nombre_producto, variante')
            .in('sku', skus);

          // Prepare details for insertion
          const details = items.map((item: BsaleDetail) => {
            const variant = variants?.find(v => v.sku === item.variant.code);
            return {
              reception_id: reception.id,
              sku: item.variant.code,
              nombre_producto: variant?.nombre_producto || 'Producto desconocido',
              variante: variant?.variante || null,
              quantity: item.quantity,
              unit_cost: item.unitCost || 0,
              bin_code: 'HISTÓRICO' // Historical records don't have bin info
            };
          });

          // Insert details
          const { error: insertError } = await supabaseAdmin
            .from('stock_reception_details')
            .insert(details);

          if (insertError) {
            console.error(`Error inserting details for reception ${reception.document_number}:`, insertError);
            stats.receptions_failed++;
          } else {
            console.log(`Successfully inserted ${details.length} details for reception ${reception.document_number}`);
            stats.receptions_processed++;
            stats.details_inserted += details.length;
          }

        } catch (error) {
          console.error(`Error processing reception ${reception.document_number}:`, error);
          stats.receptions_failed++;
        }
      }
    }

    // Process stock consumptions
    console.log('Starting to process stock consumptions...');
    const { data: consumptions } = await supabaseAdmin
      .from('stock_consumptions')
      .select('id, document_number, bsale_response')
      .not('bsale_response', 'is', null);

    if (consumptions) {
      for (const consumption of consumptions) {
        try {
          // Check if already has details
          const { count } = await supabaseAdmin
            .from('stock_consumption_details')
            .select('*', { count: 'exact', head: true })
            .eq('consumption_id', consumption.id);

          if (count && count > 0) {
            console.log(`Consumption ${consumption.document_number} already has details, skipping`);
            continue;
          }

          const bsaleResponse = consumption.bsale_response as any;
          const bsaleId = bsaleResponse?.id;

          if (!bsaleId) {
            console.log(`Consumption ${consumption.document_number} has no BSale ID, skipping`);
            stats.consumptions_failed++;
            continue;
          }

          // Fetch details from BSale API
          console.log(`Fetching details for consumption ${consumption.document_number} (BSale ID: ${bsaleId})`);
          const detailsUrl = `https://api.bsale.io/v1/stocks/consumptions/${bsaleId}/details.json`;
          const detailsResponse = await fetch(detailsUrl, {
            headers: { 'access_token': bsaleAccessToken }
          });

          if (!detailsResponse.ok) {
            console.error(`Failed to fetch details for consumption ${consumption.document_number}`);
            stats.consumptions_failed++;
            continue;
          }

          const detailsData = await detailsResponse.json();
          const items = detailsData?.items || [];

          if (items.length === 0) {
            console.log(`No details found for consumption ${consumption.document_number}`);
            stats.consumptions_failed++;
            continue;
          }

          // Get product info for all SKUs
          const skus = items.map((item: BsaleDetail) => item.variant.code);
          const { data: variants } = await supabaseAdmin
            .from('variants')
            .select('sku, nombre_producto, variante')
            .in('sku', skus);

          // Prepare details for insertion
          const details = items.map((item: BsaleDetail) => {
            const variant = variants?.find(v => v.sku === item.variant.code);
            return {
              consumption_id: consumption.id,
              sku: item.variant.code,
              nombre_producto: variant?.nombre_producto || 'Producto desconocido',
              variante: variant?.variante || null,
              quantity: item.quantity,
              bin_code: 'HISTÓRICO' // Historical records don't have bin info
            };
          });

          // Insert details
          const { error: insertError } = await supabaseAdmin
            .from('stock_consumption_details')
            .insert(details);

          if (insertError) {
            console.error(`Error inserting details for consumption ${consumption.document_number}:`, insertError);
            stats.consumptions_failed++;
          } else {
            console.log(`Successfully inserted ${details.length} details for consumption ${consumption.document_number}`);
            stats.consumptions_processed++;
            stats.details_inserted += details.length;
          }

        } catch (error) {
          console.error(`Error processing consumption ${consumption.document_number}:`, error);
          stats.consumptions_failed++;
        }
      }
    }

    console.log('Backfill completed:', stats);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Backfill completed successfully',
        stats
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in backfill function:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || 'Unknown error occurred',
        details: error.toString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
})
