import { createSupabaseClient } from '../_shared/supabase-client.ts'
import { makeBsaleRequest } from '../_shared/bsale-api.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TransferItem {
  sku: string
  quantity: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createSupabaseClient()
    
    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    // Get user from token
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    
    if (authError || !user) {
      throw new Error('Invalid authentication')
    }

    // Check user role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, user_type_id, full_name')
      .eq('id', user.id)
      .single()

    // Check permissions using multiple methods for compatibility
    let hasPermission = false;

    // Method 1: Legacy role system (allow pickers too)
    if (profile && ['admin', 'vendedora', 'picker'].includes(profile.role)) {
      hasPermission = true;
    }

    // Method 2: New user type system - check if user has admin user type
    if (!hasPermission && profile?.user_type_id) {
      const { data: userType } = await supabase
        .from('user_types')
        .select('is_admin')
        .eq('id', profile.user_type_id)
        .single()
      
      if (userType?.is_admin) {
        hasPermission = true;
      }
    }

    // Method 3: Check specific permissions via tables
    if (!hasPermission && profile?.user_type_id) {
      const { data: permRows } = await supabase
        .from('user_type_permissions')
        .select('permissions(name)')
        .eq('user_type_id', profile.user_type_id)
      const names = (permRows || []).map((r: any) => r.permissions?.name).filter(Boolean)
      if (names.includes('emit_documents') || names.includes('picking_operations') || names.includes('manage_sales')) {
        hasPermission = true
      }
    }

    // Fallback: DB function checks
    if (!hasPermission) {
      const { data: canEmit } = await supabase.rpc('user_has_permission', { permission_name: 'emit_documents' })
      const { data: canPick } = await supabase.rpc('user_has_permission', { permission_name: 'picking_operations' })
      if (canEmit || canPick) {
        hasPermission = true
      }
    }

    if (!hasPermission) {
      throw new Error('Insufficient permissions - document emission access required')
    }

    const { 
      orderId, 
      selectedItems, 
      transportistId 
    }: { 
      orderId: string, 
      selectedItems: TransferItem[], 
      transportistId: string 
    } = await req.json()

    console.log('Creating remission guide for order:', orderId)
    console.log('Selected items:', selectedItems)
    console.log('Transportist ID:', transportistId)

    // Get order details
    const { data: pedido, error: pedidoError } = await supabase
      .from('pedidos')
      .select('*')
      .eq('pedido_id', orderId)
      .single()

    if (pedidoError || !pedido) {
      throw new Error(`Order not found: ${orderId}`)
    }

    // Get store details (destination)
    const { data: storeData, error: storeError } = await supabase
      .from('tiendas')
      .select('*')
      .eq('id', pedido.tienda_id)
      .single()

    if (storeError || !storeData) {
      throw new Error('Store not found')
    }

    // Get transportist details
    const { data: transportista, error: transportistaError } = await supabase
      .from('transportistas')
      .select('*')
      .eq('id', transportistId)
      .single()

    if (transportistaError || !transportista) {
      throw new Error('Transportista not found')
    }

    // Group items by SKU and sum quantities
    const groupedItems = new Map()
    for (const item of selectedItems) {
      if (groupedItems.has(item.sku)) {
        const existing = groupedItems.get(item.sku)
        existing.quantity += item.quantity
      } else {
        groupedItems.set(item.sku, {
          sku: item.sku,
          quantity: item.quantity
        })
      }
    }

    console.log('Grouped items:', Array.from(groupedItems.values()))

    // Get variants data for grouped items
    const skus = Array.from(groupedItems.keys())
    const { data: variants, error: variantsError } = await supabase
      .from('variants')
      .select('sku, variant_value_12')
      .in('sku', skus)

    if (variantsError) {
      throw new Error('Error fetching variants data')
    }

    // Build details array with grouped items
    const details = Array.from(groupedItems.values()).map(groupedItem => {
      const variant = variants?.find(v => v.sku === groupedItem.sku)
      if (!variant) {
        throw new Error(`Variant not found for SKU: ${groupedItem.sku}`)
      }

      return {
        quantity: groupedItem.quantity,
        code: groupedItem.sku,
        netUnitValue: Number(variant.variant_value_12)
      }
    })

    // Calculate emission date based on Lima timezone (America/Lima)
    const limaDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    // YYYY-MM-DD for shipment start
    const shipmentStartDate = limaDateStr; // e.g., 2025-09-19

    // Epoch at 00:00:00 local Lima
    const emissionDate = Math.floor(new Date(`${shipmentStartDate}T00:00:00-05:00`).getTime() / 1000);

    // Build the BSale payload
    const payload = {
      documentTypeId: 123,
      officeId: 17,
      emissionDate: emissionDate,
      shippingTypeId: 13,
      destinationOfficeId: Number(storeData.officeid),
      district: storeData.district,
      city: storeData.city,
      address: storeData.address,
      declare: 1,
      recipient: storeData.recipient,
      details: details,
      client: {
        code: String(storeData.recipient_ruc),
        district: storeData.district,
        company: storeData.recipient,
        city: storeData.city,
        address: storeData.address
      },
      dynamicAttributes: [
        { alias: "shipmentTransportModeCode", values: ["01"] },
        { alias: "shipmentCarrierCompanyName", values: [transportista.nombre_empresa] },
        { alias: "shipmentCarrierCodeType", values: ["6"] },
        { alias: "shipmentCarrierCode", values: [String(transportista.ruc)] },
        { alias: "shipmentStartDate", values: [shipmentStartDate] },
        { alias: "shipmentOriginAddressDescription", values: ["Prol. Lucanas 1043"] },
        { alias: "shipmentOriginAddressId", values: ["150115"] },
        { alias: "shipmentDeliveryAddressId", values: [storeData.ubigeo_tiendas?.toString() || ""] },
        { alias: "deliveryAddressCode", values: [storeData.code_bsale_sunat || ""] },
        { alias: "despatchAddressCode", values: ["0046"] },
        { alias: "shipmentGrossWeightMeasure", values: ["1"] }
      ]
    }

    console.log('BSale payload:', JSON.stringify(payload, null, 2))

    // Make request to BSale API
    const bsaleResponse = await makeBsaleRequest('shippings.json', payload)

    console.log('BSale remission guide response:', bsaleResponse)

    // Extract guide info safely (Bsale nests it under guide)
    const guideUrl = bsaleResponse?.guide?.urlPublicView ?? bsaleResponse?.urlPublicView ?? null
    const guideNumber = bsaleResponse?.guide?.number ?? bsaleResponse?.number ?? null
    const detailsHref = bsaleResponse?.guide?.href ?? bsaleResponse?.details?.href ?? bsaleResponse?.href ?? null

    if (!bsaleResponse) {
      throw new Error('BSale no devolvió una respuesta válida para el documento')
    }

    // Update order with remission guide info (even if URL is null we persist response metadata)
    const { error: updateError } = await supabase
      .from('pedidos')
      .update({
        estado: 'procesado',
        url_public_view: guideUrl,
        serial_number: guideNumber ? String(guideNumber) : null,
        details_href: detailsHref,
        id_bsale_documento: bsaleResponse.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', pedido.id)

    if (updateError) {
      console.error('Error updating order:', updateError)
      throw new Error('Error al actualizar el pedido con la información del documento')
    }

    // Audit log for dashboard counters
    const userName = (profile as any)?.full_name || user.email || 'Sistema'
    await supabase
      .from('pedidos_audit_log')
      .insert({
        pedido_id: pedido.id,
        pedido_codigo: pedido.pedido_id,
        accion: 'documento_emitido',
        estado_anterior: pedido.estado,
        estado_nuevo: 'procesado',
        usuario_id: user.id,
        usuario_nombre: userName,
        detalles: { guideUrl, guideNumber, shippingId: bsaleResponse?.id ?? null }
      })

    // Update stock quantities - move from comprometido to reduce available stock
    for (const item of selectedItems) {
      // First get all stock records for this SKU
      const { data: stockRecords, error: stockError } = await supabase
        .from('stockxbin')
        .select('*')
        .eq('sku', item.sku)
        .gt('comprometido', 0)
        .order('comprometido', { ascending: false })

      if (stockError) {
        console.error('Error fetching stock records:', stockError)
        continue
      }

      let remainingToProcess = item.quantity

      for (const stockRecord of stockRecords || []) {
        if (remainingToProcess <= 0) break

        const toProcess = Math.min(stockRecord.comprometido, remainingToProcess)

        const { error: updateStockError } = await supabase
          .from('stockxbin')
          .update({
            comprometido: stockRecord.comprometido - toProcess,
            en_existencia: stockRecord.en_existencia - toProcess,
            updated_at: new Date().toISOString()
          })
          .eq('id', stockRecord.id)

        if (updateStockError) {
          console.error('Error updating stock:', updateStockError)
        } else {
          remainingToProcess -= toProcess
        }
      }
    }

    // **STEP 4: Create traslados_internos record**
    console.log('Creating traslados_internos record...')
    
    // Get next document number for internal transfers
    const { data: nextDocNumber, error: docNumberError } = await supabase
      .rpc('get_next_transfer_number')
    
    if (docNumberError) {
      console.error('Error getting next transfer number:', docNumberError)
      throw new Error('Error al obtener número de documento de traslado')
    }

    const totalItems = selectedItems.reduce((sum, item) => sum + item.quantity, 0)

    const { data: transferRecord, error: transferError } = await supabase
      .from('traslados_internos')
      .insert({
        pedido_id: pedido.id,
        tienda_id: pedido.tienda_id,
        document_number: nextDocNumber,
        emission_date: emissionDate,
        office_id: 17,
        destination_office_id: String(storeData.officeid),
        recipient: storeData.recipient,
        address: storeData.address,
        city: storeData.city,
        district: storeData.district,
        total_items: totalItems,
        url_public_view: guideUrl,
        bsale_response: bsaleResponse
      })
      .select('id')
      .single()

    if (transferError) {
      console.error('Error creating traslados_internos record:', transferError)
      throw new Error('Error al crear registro de traslado interno')
    }

    console.log('Transfer record created with ID:', transferRecord.id)

    // **STEP 5: Create traslados_internos_detalle records**
    console.log('Creating traslados_internos_detalle records...')
    
    const transferDetails = selectedItems.map(item => {
      const variant = variants?.find(v => v.sku === item.sku)
      return {
        traslado_id: transferRecord.id,
        sku: item.sku,
        quantity: item.quantity,
        net_unit_value: Number(variant?.variant_value_12 || 0)
      }
    })

    const { error: detailsError } = await supabase
      .from('traslados_internos_detalle')
      .insert(transferDetails)

    if (detailsError) {
      console.error('Error creating transfer details:', detailsError)
      throw new Error('Error al crear detalles del traslado interno')
    }

    console.log('Transfer details created successfully')

    // **STEP 6: Clean up active assignments**
    console.log('Cleaning up pedidos_asignaciones...')
    
    const { error: assignmentsError } = await supabase
      .from('pedidos_asignaciones')
      .delete()
      .eq('pedido_id', pedido.id)

    if (assignmentsError) {
      console.error('Error cleaning up assignments:', assignmentsError)
      // This is not critical, so we continue
    } else {
      console.log('Active assignments cleaned up successfully')
    }

    // **STEP 7: Archive the order**
    console.log('Archiving the order...')
    
    const { error: archiveError } = await supabase
      .from('pedidos')
      .update({
        estado: 'archivado',
        updated_at: new Date().toISOString()
      })
      .eq('id', pedido.id)

    if (archiveError) {
      console.error('Error archiving order:', archiveError)
      throw new Error('Error al archivar el pedido')
    }

    console.log('Order archived successfully')

    // **STEP 8: Add final audit log**
    await supabase
      .from('pedidos_audit_log')
      .insert({
        pedido_id: pedido.id,
        pedido_codigo: pedido.pedido_id,
        accion: 'completado',
        estado_anterior: 'procesado',
        estado_nuevo: 'archivado',
        usuario_id: user.id,
        usuario_nombre: userName,
        detalles: { 
          guideUrl, 
          guideNumber, 
          shippingId: bsaleResponse?.id ?? null,
          transferDocumentNumber: nextDocNumber,
          completedAutomatically: true
        }
      })

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Guía de remisión creada exitosamente',
        bsaleResponse 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in create-remission-guide function:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})