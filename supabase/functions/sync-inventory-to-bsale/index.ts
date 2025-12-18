import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { isMigrationModeActive } from '../_shared/migration-mode.ts'

serve(async (req) => {
  console.log('Sync inventory to BSale function called:', req.method)
  
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

    // Verify user and check permissions
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check user permissions
    const { data: profile } = await supabase
      .from('profiles')
      .select(`
        role,
        user_type_id,
        user_types!inner(
          is_admin,
          user_type_permissions(
            permissions(name)
          )
        )
      `)
      .eq('id', user.id)
      .single();

    // Check if user has permission
    const hasInventoryPermission = profile?.role === 'admin' || 
                                  profile?.user_types?.is_admin || 
                                  profile?.user_types?.user_type_permissions?.some((utp: any) => 
                                    utp.permissions?.name === 'manage_inventory');

    if (!hasInventoryPermission) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions - inventory management required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const requestData = await req.json();
    console.log('Request data:', requestData);

    const { changes, inventory_id } = requestData;

    if (!changes || !Array.isArray(changes)) {
      return new Response(
        JSON.stringify({ error: 'Invalid changes data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if migration mode is active
    const migrationMode = await isMigrationModeActive();
    
    if (migrationMode) {
      console.log('MIGRATION MODE ACTIVE - Skipping BSale synchronization');
      
      // Update inventory record with migration mode note
      if (inventory_id) {
        await supabase
          .from('bin_inventories')
          .update({
            notes: `Inventario finalizado en Modo Migración - No sincronizado con BSale`
          })
          .eq('id', inventory_id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          migration_mode: true,
          message: 'Modo Migración activo - Sincronización con BSale omitida',
          summary: {
            total_changes: changes.length,
            synced_to_bsale: 0
          }
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const bsaleAccessToken = Deno.env.get('BSALE_ACCESS_TOKEN');
    if (!bsaleAccessToken) {
      return new Response(
        JSON.stringify({ error: 'BSale access token not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let successCount = 0;
    let errorCount = 0;
    const results: any[] = [];

    // Process each inventory change
    for (const change of changes) {
      if (change.change_type === 'no_change') {
        continue; // Skip items with no changes
      }

      try {
        // Get variant information from our database
        const { data: variant } = await supabase
          .from('variants')
          .select('id, sku, costo')
          .eq('sku', change.sku)
          .single();

        if (!variant) {
          console.log(`Variant not found for SKU: ${change.sku}`);
          errorCount++;
          results.push({
            sku: change.sku,
            success: false,
            error: 'Variant not found'
          });
          continue;
        }

        // Determine BSale operation type based on change
        let bsaleOperation;
        let quantity = Math.abs(change.difference);

        if (change.change_type === 'increase') {
          // Stock increase - create reception
          bsaleOperation = {
            url: 'https://api.bsale.io/v1/stocks/receptions.json',
            data: {
              officeId: 17, // Central office
              details: [{
                variantId: parseInt(variant.id),
                quantity: quantity,
                cost: variant.costo || 0
              }],
              note: `Ajuste de inventario - Incremento (Bin: inventario)`
            }
          };
        } else {
          // Stock decrease - create consumption  
          bsaleOperation = {
            url: 'https://api.bsale.io/v1/stocks/consumptions.json',
            data: {
              officeId: 17, // Central office
              details: [{
                variantId: parseInt(variant.id),
                quantity: quantity,
                cost: variant.costo || 0
              }],
              note: `Ajuste de inventario - Reducción (Bin: inventario)`
            }
          };
        }

        console.log(`Making BSale API call for SKU ${change.sku}:`, bsaleOperation);

        // Make BSale API call
        const bsaleResponse = await fetch(bsaleOperation.url, {
          method: 'POST',
          headers: {
            'Access-Token': bsaleAccessToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(bsaleOperation.data)
        });

        const responseText = await bsaleResponse.text();
        console.log(`BSale response for SKU ${change.sku}:`, bsaleResponse.status, responseText);

        if (bsaleResponse.ok) {
          successCount++;
          results.push({
            sku: change.sku,
            success: true,
            bsale_response: JSON.parse(responseText)
          });
        } else {
          errorCount++;
          results.push({
            sku: change.sku,
            success: false,
            error: `BSale API error: ${bsaleResponse.status} - ${responseText}`
          });
        }

      } catch (error) {
        console.error(`Error processing change for SKU ${change.sku}:`, error);
        errorCount++;
        results.push({
          sku: change.sku,
          success: false,
          error: error.message
        });
      }
    }

    // Update inventory record with sync results
    if (inventory_id) {
      await supabase
        .from('bin_inventories')
        .update({
          notes: `BSale sync: ${successCount} exitosos, ${errorCount} errores`
        })
        .eq('id', inventory_id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        migration_mode: false,
        message: `Sincronización completada: ${successCount} exitosos, ${errorCount} errores`,
        results: results,
        summary: {
          total_processed: changes.length,
          successful: successCount,
          errors: errorCount
        }
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in sync-inventory-to-bsale:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});