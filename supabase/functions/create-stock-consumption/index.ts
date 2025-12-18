import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { isMigrationModeActive } from '../_shared/migration-mode.ts'
import { checkUserPermission } from '../_shared/permission-helpers.ts'

serve(async (req) => {
  console.log('Stock consumption function called:', req.method)
  
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

    // Initialize Supabase client for user verification
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user and check role
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check permissions using unified helper
    const hasPermission = await checkUserPermission(supabase, user.id, {
      permissionName: 'stock_withdrawal',
      allowedRoles: ['admin'],
      allowedUserTypeNames: ['admin', 'supervisor']
    });

    if (!hasPermission) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions - stock withdrawal access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize admin client for database operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    const requestBody = await req.json()
    const { products, note, bin, internal_identifier } = requestBody
    console.log('Request data:', { products, note, bin, internal_identifier })

    // Validate request data
    if (!products || !Array.isArray(products) || products.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Products array is required and cannot be empty' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get next consumption document number
    const { data: nextNumber, error: numberError } = await supabaseAdmin
      .rpc('get_next_consumption_number')
    
    if (numberError) {
      console.error('Error getting next number:', numberError)
      throw numberError
    }

    const documentNumber = nextNumber
    const finalNote = note || `Guia de Consumo ${documentNumber}`
    
    console.log('Using document number:', documentNumber, 'Note:', finalNote)

    // Check if migration mode is active
    const migrationMode = await isMigrationModeActive();
    let bsaleData = null;

    if (!migrationMode) {
      // Only call BSale if NOT in migration mode
      const bsaleAccessToken = Deno.env.get('BSALE_ACCESS_TOKEN');
      if (!bsaleAccessToken) {
        return new Response(
          JSON.stringify({ error: 'BSale access token not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Prepare BSale API request details
      const details = []
      for (const product of products) {
        // Get variant ID from the variants table
        const { data: variantData, error: variantError } = await supabaseAdmin
          .from('variants')
          .select('id')
          .eq('sku', product.sku)
          .single()

        if (variantError) {
          console.error(`Error fetching variant for SKU ${product.sku}:`, variantError)
          throw new Error(`Variant not found for SKU: ${product.sku}`)
        }

        details.push({
          quantity: product.quantity,
          variantId: parseInt(variantData.id)
        })
      }

      // Prepare BSale request
      const bsalePayload = {
        note: finalNote,
        officeId: 17,
        details: details
      }

      console.log('BSale payload:', bsalePayload)

      // Make request to BSale API
      const bsaleResponse = await fetch('https://api.bsale.io/v1/stocks/consumptions.json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': bsaleAccessToken
        },
        body: JSON.stringify(bsalePayload)
      })

      bsaleData = await bsaleResponse.json()
      console.log('BSale response status:', bsaleResponse.status)
      console.log('BSale response data:', bsaleData)

      if (!bsaleResponse.ok) {
        throw new Error(`BSale API error: ${bsaleResponse.status} - ${JSON.stringify(bsaleData)}`)
      }
    } else {
      console.log('MIGRATION MODE ACTIVE - Skipping BSale API call');
    }

    // Get user profile for audit
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    // Save consumption to database (regardless of migration mode)
    const { data: consumptionData, error: insertError } = await supabaseAdmin
      .from('stock_consumptions')
      .insert({
        document_number: documentNumber,
        office_id: 17,
        note: finalNote,
        bsale_response: bsaleData,
        total_items: products.length,
        created_by: user.id,
        created_by_name: profile?.full_name || user.email,
        internal_identifier: internal_identifier || null
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error saving consumption:', insertError)
      throw insertError
    }

    console.log('Consumption saved successfully:', consumptionData)

    // Insert consumption details
    const consumptionDetails = products.map(product => ({
      consumption_id: consumptionData.id,
      sku: product.sku,
      quantity: product.quantity,
      bin_code: bin || 'N/A'
    }));

    // Get product names for the details
    const skuList = products.map(p => p.sku);
    const { data: variants } = await supabaseAdmin
      .from('variants')
      .select('sku, nombre_producto, variante')
      .in('sku', skuList);

    const detailsWithNames = consumptionDetails.map(detail => {
      const variant = variants?.find(v => v.sku === detail.sku);
      return {
        ...detail,
        nombre_producto: variant?.nombre_producto || 'Producto desconocido',
        variante: variant?.variante || null
      };
    });

    const { error: detailsError } = await supabaseAdmin
      .from('stock_consumption_details')
      .insert(detailsWithNames);

    if (detailsError) {
      console.error('Error saving consumption details:', detailsError);
      // Don't throw - this is not critical, the main consumption was saved
    }

    // Update stockxbins for each item in the consumption (reduce stock)
    if (bin) {
      for (const product of products) {
        console.log(`Reducing stock for SKU ${product.sku} in bin ${bin}`)
        
        // First get the current stock values for the specific bin
        const { data: currentStock, error: fetchError } = await supabaseAdmin
          .from('stockxbin')
          .select('disponibles, comprometido')
          .eq('sku', product.sku)
          .eq('bin', bin)
          .single()

        if (fetchError) {
          console.error(`Error fetching current stock for SKU ${product.sku} in bin ${bin}:`, fetchError)
          continue
        }

        // Calculate new values (reduce disponibles)
        const newDisponibles = (currentStock.disponibles || 0) - product.quantity
        const newEnExistencia = newDisponibles + (currentStock.comprometido || 0)

        const { error: updateError } = await supabaseAdmin
          .from('stockxbin')
          .update({
            disponibles: newDisponibles,
            en_existencia: newEnExistencia,
            updated_at: new Date().toISOString()
          })
          .eq('sku', product.sku)
          .eq('bin', bin)

        if (updateError) {
          console.error(`Error updating stockxbin for SKU ${product.sku} in bin ${bin}:`, updateError)
          // Continue with other items even if one fails
        } else {
          console.log(`Successfully updated stockxbin for SKU ${product.sku} in bin ${bin}: -${product.quantity} disponibles (new total: ${newDisponibles})`)
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        migration_mode: migrationMode,
        message: migrationMode
          ? 'Stock consumption created successfully (Migration Mode - No BSale sync)'
          : 'Stock consumption created successfully',
        consumption: consumptionData,
        bsale_data: bsaleData 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error in create-stock-consumption:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Unknown error occurred',
        details: error.toString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
