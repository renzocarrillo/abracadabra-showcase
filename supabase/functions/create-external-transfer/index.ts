import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { checkUserPermission } from '../_shared/permission-helpers.ts'

serve(async (req) => {
  console.log('External transfer function called:', req.method)
  
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
      permissionName: 'manage_transfers',
      allowedRoles: ['admin'],
      allowedUserTypeNames: ['admin', 'supervisor']
    });

    if (!hasPermission) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions - transfer management access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize admin client for database operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    const { orderId, selectedItems, storeInfo, productosRetiradosPor } = await req.json()
    console.log('Request data:', { orderId, selectedItems, storeInfo, productosRetiradosPor })

    // Validate request data
    if (!orderId || !selectedItems || !Array.isArray(selectedItems) || selectedItems.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid request data: orderId and selectedItems array are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!storeInfo || !storeInfo.officeid) {
      return new Response(
        JSON.stringify({ error: 'Invalid request data: storeInfo with officeid is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate that store does NOT belong to Innovation (this function is only for external stores)
    if (storeInfo.pertenenceinnovacion) {
      console.log('Store belongs to Innovation, this function is for external stores only')
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'This function is only for stores that do not belong to Innovation'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    // Get store details from database
    const { data: tiendaData, error: tiendaError } = await supabaseAdmin
      .from('tiendas')
      .select('*')
      .eq('officeid', storeInfo.officeid)
      .single()

    if (tiendaError || !tiendaData) {
      console.error('Error fetching store data:', tiendaError)
      return new Response(
        JSON.stringify({ error: 'Store not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get current emission date (Unix timestamp)
    const emissionDate = Math.floor(Date.now() / 1000)

    // Group items by SKU and sum quantities
    const groupedItems = new Map()
    for (const item of selectedItems) {
      if (groupedItems.has(item.sku)) {
        const existing = groupedItems.get(item.sku)
        existing.quantity += item.quantity
        // Keep track of bins for stock updates later
        existing.bins.push({ bin: item.bin, quantity: item.quantity })
      } else {
        groupedItems.set(item.sku, {
          sku: item.sku,
          quantity: item.quantity,
          bins: [{ bin: item.bin, quantity: item.quantity }]
        })
      }
    }

    console.log('Grouped items:', Array.from(groupedItems.values()))

    // Prepare details for BSale with grouped items
    const details = []
    for (const [sku, groupedItem] of groupedItems) {
      // Get variant_value_12 from variants table
      const { data: variantData, error: variantError } = await supabaseAdmin
        .from('variants')
        .select('variant_value_12')
        .eq('sku', sku)
        .single()

      if (variantError || !variantData) {
        console.error(`Error fetching variant_value_12 for SKU ${sku}:`, variantError)
        throw new Error(`Variant value not found for SKU: ${sku}`)
      }

      details.push({
        quantity: groupedItem.quantity,
        code: sku,
        netUnitValue: parseFloat(variantData.variant_value_12 || '0')
      })
    }

    // Prepare BSale request payload for external transfers
    const bsalePayload = {
      documentTypeId: 37,
      officeId: 17,
      emissionDate: emissionDate,
      shippingTypeId: 10,
      district: tiendaData.district || "Lima",
      city: tiendaData.city || "Lima",
      address: tiendaData.address || "",
      declare: 0,
      recipient: tiendaData.recipient || "",
      details: details,
      client: {
        code: tiendaData.recipient_ruc?.toString() || "",
        district: tiendaData.district || "Lima",
        company: tiendaData.recipient || "",
        city: tiendaData.city || "Lima",
        address: tiendaData.address || ""
      }
    }

    console.log('BSale external transfer payload:', JSON.stringify(bsalePayload, null, 2))

    // Make request to BSale API
    const bsaleAccessToken = Deno.env.get('BSALE_ACCESS_TOKEN');
    const bsaleResponse = await fetch('https://api.bsale.io/v1/shippings.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': bsaleAccessToken
      },
      body: JSON.stringify(bsalePayload)
    })

    const bsaleData = await bsaleResponse.json()
    console.log('BSale response status:', bsaleResponse.status)
    console.log('BSale response data:', bsaleData)

    if (!bsaleResponse.ok) {
      throw new Error(`BSale API error: ${bsaleResponse.status} - ${JSON.stringify(bsaleData)}`)
    }

    // Get order data for saving transfer
    const { data: orderData, error: orderError } = await supabaseAdmin
      .from('pedidos')
      .select('id')
      .eq('pedido_id', orderId)
      .single()

    if (orderError) {
      console.error('Error fetching order:', orderError)
      throw orderError
    }

    // Get next transfer document number
    const { data: nextNumber, error: numberError } = await supabaseAdmin
      .rpc('get_next_transfer_number')
    
    if (numberError) {
      console.error('Error getting next number:', numberError)
      throw numberError
    }

    const documentNumber = nextNumber
    console.log('Using document number:', documentNumber)

    // Extract urlPublicView from BSale response
    const urlPublicView = bsaleData?.guide?.urlPublicView || null;
    console.log('URL Public View extracted:', urlPublicView);

    // Save external transfer to database
    const { data: transferData, error: insertError } = await supabaseAdmin
      .from('traslados_internos')
      .insert({
        document_number: documentNumber,
        emission_date: emissionDate,
        office_id: 17,
        destination_office_id: storeInfo.officeid,
        recipient: tiendaData.recipient || "",
        district: tiendaData.district || "Lima",
        city: tiendaData.city || "Lima",
        address: tiendaData.address || "",
        total_items: selectedItems.length,
        bsale_response: bsaleData,
        pedido_id: orderData.id,
        tienda_id: tiendaData.id,
        url_public_view: urlPublicView,
        sucursal_destino_nombre: tiendaData.nombre,
        bsale_guide_id: bsaleData?.guide?.id || null
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error saving external transfer:', insertError)
      throw insertError
    }

    console.log('External transfer saved successfully:', transferData)

    // Update order status to archived and save url_public_view
    const { error: orderUpdateError } = await supabaseAdmin
      .from('pedidos')
      .update({ 
        estado: 'archivado',
        url_public_view: urlPublicView,
        productos_retirados_por: productosRetiradosPor || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderData.id)

    // Log audit trail
    try {
      await supabaseAdmin.rpc('log_pedido_state_change', {
        p_pedido_id: orderData.id,
        p_pedido_codigo: orderId,
        p_accion: 'completado',
        p_estado_anterior: 'pendiente',
        p_estado_nuevo: 'archivado',
        p_usuario_id: user?.id || null,
        p_usuario_nombre: 'Sistema - Traslado Externo',
        p_detalles: JSON.stringify({
          tipo_operacion: 'traslado_externo',
          tienda_destino: tiendaData.nombre,
          documento_bsale: bsaleData?.number
        })
      })
    } catch (auditError) {
      console.error('Error logging audit trail:', auditError)
      // Continue with the process even if audit logging fails
    }

    if (orderUpdateError) {
      console.error('Error updating order status:', orderUpdateError)
      // Continue with the process even if status update fails
    } else {
      console.log('Order marked as archived successfully')
    }

    // Save transfer details
    for (const item of selectedItems) {
      const variantData = await supabaseAdmin
        .from('variants')
        .select('variant_value_12')
        .eq('sku', item.sku)
        .single()

      const { error: detailError } = await supabaseAdmin
        .from('traslados_internos_detalle')
        .insert({
          traslado_id: transferData.id,
          sku: item.sku,
          quantity: item.quantity,
          net_unit_value: parseFloat(variantData.data?.variant_value_12 || '0')
        })

      if (detailError) {
        console.error('Error saving external transfer detail:', detailError)
        // Continue with other items even if one fails
      }
    }

    // Update stockxbin - reduce stock for each item and bin using the original ungrouped data
    for (const item of selectedItems) {
      console.log(`Reducing stock for SKU ${item.sku} in bin ${item.bin}`)
      
      // Get current stock values for the specific bin
      const { data: currentStock, error: fetchError } = await supabaseAdmin
        .from('stockxbin')
        .select('disponibles, comprometido')
        .eq('sku', item.sku)
        .eq('bin', item.bin)
        .single()

      if (fetchError) {
        console.error(`Error fetching current stock for SKU ${item.sku} in bin ${item.bin}:`, fetchError)
        continue
      }

      // Calculate new values (reduce disponibles AND comprometido since items were assigned)
      const newDisponibles = Math.max(0, (currentStock.disponibles || 0))
      const newComprometido = Math.max(0, (currentStock.comprometido || 0) - item.quantity)
      const newEnExistencia = newDisponibles + newComprometido

      const { error: updateError } = await supabaseAdmin
        .from('stockxbin')
        .update({
          disponibles: newDisponibles,
          comprometido: newComprometido,
          en_existencia: newEnExistencia,
          updated_at: new Date().toISOString()
        })
        .eq('sku', item.sku)
        .eq('bin', item.bin)

      if (updateError) {
        console.error(`Error updating stockxbin for SKU ${item.sku} in bin ${item.bin}:`, updateError)
      } else {
        console.log(`Successfully updated stockxbin for SKU ${item.sku} in bin ${item.bin}: -${item.quantity} comprometido (new total: ${newComprometido})`)
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        trasladoData: transferData,
        bsale_data: bsaleData 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error in create-external-transfer:', error)
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
