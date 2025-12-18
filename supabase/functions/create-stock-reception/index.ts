import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { isMigrationModeActive } from '../_shared/migration-mode.ts'
import { checkUserPermission } from '../_shared/permission-helpers.ts'

interface StockReceptionRequest {
  document: string
  officeId: number
  documentNumber: string
  note: string
  bin: string
  internal_identifier?: string
  details: Array<{
    quantity: number
    code: string
    cost: number
  }>
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
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

    // Initialize Supabase client for auth check
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Check authentication
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check permissions
    const hasPermission = await checkUserPermission(supabaseAuth, user.id, {
      permissionName: 'stock_entry',
      allowedRoles: ['admin'],
      allowedUserTypeNames: ['admin', 'supervisor']
    });

    if (!hasPermission) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions - stock entry access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const requestData: StockReceptionRequest = await req.json()
    console.log('Stock reception request:', requestData)

    // Check if migration mode is active
    const migrationMode = await isMigrationModeActive();
    let bsaleResult = null;

    if (!migrationMode) {
      // Only call BSale if NOT in migration mode
      const bsaleAccessToken = Deno.env.get('BSALE_ACCESS_TOKEN');
      if (!bsaleAccessToken) {
        return new Response(
          JSON.stringify({ error: 'BSale access token not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Make the request to BSale API
      const bsaleResponse = await fetch('https://api.bsale.io/v1/stocks/receptions.json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': bsaleAccessToken,
        },
        body: JSON.stringify(requestData)
      })

      bsaleResult = await bsaleResponse.json()
      console.log('BSale response:', bsaleResponse.status, bsaleResult)

      if (!bsaleResponse.ok) {
        return new Response(
          JSON.stringify({
            success: false,
            error: bsaleResult.error || bsaleResult.message || 'BSale API error',
            details: bsaleResult
          }),
          {
            status: bsaleResponse.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }
    } else {
      console.log('MIGRATION MODE ACTIVE - Skipping BSale API call');
    }

    // Get user profile for audit
    const { data: profile } = await supabaseAuth
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    // Save stock reception record with audit fields
    const { data: receptionData, error: receptionError } = await supabaseAuth
      .from('stock_receptions')
      .insert({
        document_number: parseInt(requestData.documentNumber),
        note: requestData.note || 'Ingreso de stock desde sistema',
        total_items: requestData.details.reduce((sum, d) => sum + d.quantity, 0),
        bsale_response: bsaleResult,
        created_by: user.id,
        created_by_name: profile?.full_name || user.email,
        internal_identifier: requestData.internal_identifier || null
      })
      .select()
      .single();

    if (receptionError) {
      console.error('Error saving stock reception:', receptionError);
      throw receptionError;
    }

    // Insert reception details
    const receptionDetails = requestData.details.map(detail => ({
      reception_id: receptionData.id,
      sku: detail.code,
      quantity: detail.quantity,
      bin_code: requestData.bin,
      unit_cost: detail.cost
    }));

    // First get product names for the details
    const skuList = requestData.details.map(d => d.code);
    const { data: variants } = await supabaseAuth
      .from('variants')
      .select('sku, nombre_producto, variante')
      .in('sku', skuList);

    const detailsWithNames = receptionDetails.map(detail => {
      const variant = variants?.find(v => v.sku === detail.sku);
      return {
        ...detail,
        nombre_producto: variant?.nombre_producto || 'Producto desconocido',
        variante: variant?.variante || null
      };
    });

    const { error: detailsError } = await supabaseAuth
      .from('stock_reception_details')
      .insert(detailsWithNames);

    if (detailsError) {
      console.error('Error saving reception details:', detailsError);
      // Don't throw - this is not critical, the main reception was saved
    }

    // Update our stockxbins table (regardless of migration mode)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Update stockxbins for each item in the reception
    const stockUpdateErrors = [];
    
    for (const detail of requestData.details) {
      console.log(`Updating stock for SKU ${detail.code} in bin ${requestData.bin}`)
      
      // First try to get the current stock values for the specific bin
      const { data: currentStock } = await supabase
        .from('stockxbin')
        .select('id, disponibles, comprometido, idBsale')
        .eq('sku', detail.code)
        .eq('bin', requestData.bin)
        .maybeSingle()

      if (currentStock) {
        // Record exists, update it
        const newDisponibles = (currentStock.disponibles || 0) + detail.quantity
        const newEnExistencia = newDisponibles + (currentStock.comprometido || 0)

        const { error: updateError } = await supabase
          .from('stockxbin')
          .update({
            disponibles: newDisponibles,
            en_existencia: newEnExistencia,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentStock.id)

        if (updateError) {
          console.error(`Error updating stockxbin for SKU ${detail.code} in bin ${requestData.bin}:`, updateError)
          stockUpdateErrors.push({ sku: detail.code, error: updateError.message });
        } else {
          console.log(`Successfully updated stockxbin for SKU ${detail.code} in bin ${requestData.bin}: +${detail.quantity} disponibles (new total: ${newDisponibles})`)
        }
      } else {
        // Record doesn't exist, create it
        console.log(`Creating new stockxbin record for SKU ${detail.code} in bin ${requestData.bin}`)
        
        // First, verify the variant exists and get its ID
        const { data: variant, error: variantError } = await supabase
          .from('variants')
          .select('id')
          .eq('sku', detail.code)
          .maybeSingle()
        
        if (variantError || !variant) {
          const errorMsg = `SKU ${detail.code} no existe en la tabla de variantes`;
          console.error(errorMsg);
          stockUpdateErrors.push({ sku: detail.code, error: errorMsg });
          continue;
        }
        
        // Use the variant ID as idBsale
        const idBsaleResolved = variant.id.toString();
        console.log(`Resolved idBsale for SKU ${detail.code}: ${idBsaleResolved} (from variants table)`)
        
        const { error: insertError } = await supabase
          .from('stockxbin')
          .insert({
            sku: detail.code,
            bin: requestData.bin,
            disponibles: detail.quantity,
            comprometido: 0,
            en_existencia: detail.quantity,
            idBsale: idBsaleResolved,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })

        if (insertError) {
          console.error(`Error creating stockxbin for SKU ${detail.code} in bin ${requestData.bin}:`, insertError)
          stockUpdateErrors.push({ sku: detail.code, error: insertError.message });
        } else {
          console.log(`Successfully created stockxbin for SKU ${detail.code} in bin ${requestData.bin}: ${detail.quantity} disponibles (idBsale: ${idBsaleResolved})`)
        }
      }

      // Recalculate and upsert stock_totals for this SKU
      const { data: skuRows, error: sumError } = await supabase
        .from('stockxbin')
        .select('disponibles, comprometido')
        .eq('sku', detail.code)

      if (sumError) {
        console.error(`Error aggregating totals for SKU ${detail.code}:`, sumError)
      } else {
        const total_disponible = (skuRows || []).reduce((acc, r: any) => acc + (r.disponibles || 0), 0)
        const total_comprometido = (skuRows || []).reduce((acc, r: any) => acc + (r.comprometido || 0), 0)
        const total_en_existencia = total_disponible + total_comprometido

        // Try update first
        const { data: existingTotal } = await supabase
          .from('stock_totals')
          .select('id')
          .eq('sku', detail.code)
          .maybeSingle()

        if (existingTotal?.id) {
          const { error: totalsUpdateError } = await supabase
            .from('stock_totals')
            .update({
              total_disponible,
              total_comprometido,
              total_en_existencia
            })
            .eq('id', existingTotal.id)
          if (totalsUpdateError) {
            console.error(`Error updating stock_totals for SKU ${detail.code}:`, totalsUpdateError)
          }
        } else {
          const { error: totalsInsertError } = await supabase
            .from('stock_totals')
            .insert({
              sku: detail.code,
              total_disponible,
              total_comprometido,
              total_en_existencia
            })
          if (totalsInsertError) {
            console.error(`Error inserting stock_totals for SKU ${detail.code}:`, totalsInsertError)
          }
        }
      }
    }


    // Check if there were any stock update errors
    if (stockUpdateErrors.length > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Algunos productos no pudieron ser actualizados en el inventario local',
          migration_mode: migrationMode,
          bsale_success: !migrationMode, // BSale succeeded (if not in migration mode)
          stock_errors: stockUpdateErrors,
          data: bsaleResult
        }),
        {
          status: 207, // Multi-Status - partial success
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        migration_mode: migrationMode,
        message: migrationMode 
          ? 'Stock reception created successfully (Migration Mode - No BSale sync)'
          : 'Stock reception created successfully',
        data: bsaleResult
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Error in stock reception:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        details: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
