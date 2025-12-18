import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.1'
import { corsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts'
import { createSupabaseClient } from '../_shared/supabase-client.ts'
import { 
  validateSaleData, 
  getPaymentTypeId, 
  calculateEmissionDate, 
  buildDocumentDetails, 
  getVariantsData,
  fetchDocumentDetails,
  updateVentaDetalleWithBsaleIds
} from '../_shared/document-helpers.ts'
import { makeBsaleRequest, buildFacturaPayload } from '../_shared/bsale-api.ts'
import { consumeStockFromReserved } from '../_shared/stock-management.ts'
import { checkUserPermission } from '../_shared/permission-helpers.ts'

// Helper to create remission guide via shippings.json
async function createRemissionGuide(
  supabase: any,
  venta: any,
  ventaDetails: any[],
  documentDetails: any[],
  transportistId: string,
  emissionDate: number
) {
  console.log('📦 [CREATE-GUIDE] Creating remission guide for venta:', venta.id)
  
  // Get transportist info
  const { data: transportist, error: transportistError } = await supabase
    .from('transportistas')
    .select('*')
    .eq('id', transportistId)
    .single()
  
  if (transportistError || !transportist) {
    throw new Error(`Transportista not found: ${transportistError?.message || 'Unknown error'}`)
  }
  
  console.log('✅ Transportist found:', transportist.nombre_empresa)
  
  const clienteInfo = venta.cliente_info || {}
  const envioInfo = venta.envio_info || {}
  const facturacionInfo = venta.facturacion_info || {}
  
  // Build details using SKU and quantity from ventas_detalle
  const shippingDetails = ventaDetails.map(detail => {
    const docDetail = documentDetails.find(d => d.variant?.code === detail.sku)
    return {
      code: detail.sku,
      quantity: detail.cantidad,
      netUnitValue: docDetail?.netUnitValue || detail.precio_unitario || 0
    }
  })
  
  // Calculate dates
  const today = new Date()
  const startDateYmd = today.toISOString().split('T')[0]
  
  // Build client name - for factura, use razonSocial
  const clientCompany = clienteInfo.razonSocial || 
    `${(clienteInfo.firstName || clienteInfo.nombre || '').toString().trim()} ${(clienteInfo.lastName || '').toString().trim()}`.trim() || 
    'Cliente'
  
  const clientRecipient = envioInfo.recipient || clientCompany
  
  const payload = {
    documentTypeId: 123, // Guía de remisión
    officeId: 17,
    emissionDate: emissionDate,
    priceListId: 31,
    shippingTypeId: 10,
    district: envioInfo.distrito || facturacionInfo.distrito || clienteInfo.distrito || 'Lima',
    city: envioInfo.provincia || facturacionInfo.provincia || clienteInfo.provincia || 'Lima',
    address: envioInfo.direccion || facturacionInfo.direccion || clienteInfo.direccion || '',
    declare: 1,
    recipient: clientRecipient,
    details: shippingDetails,
    client: {
      code: clienteInfo.ruc || '',
      district: envioInfo.distrito || facturacionInfo.distrito || 'Lima',
      activity: clienteInfo.activity || 'Venta de accesorios de vestir',
      company: clientCompany,
      city: envioInfo.provincia || facturacionInfo.provincia || 'Lima',
      email: clienteInfo.email || '',
      address: envioInfo.direccion || facturacionInfo.direccion || ''
    },
    dynamicAttributes: [
      { alias: "shipmentTransportModeCode", values: ["01"] },
      { alias: "shipmentCarrierCompanyName", values: [transportist.nombre_empresa] },
      { alias: "shipmentCarrierCodeType", values: ["6"] },
      { alias: "shipmentCarrierCode", values: [transportist.ruc] },
      { alias: "shipmentStartDate", values: [startDateYmd] },
      { alias: "shipmentOriginAddressDescription", values: ["Prol. Lucanas 1043"] },
      { alias: "shipmentOriginAddressId", values: ["150115"] },
      { alias: "shipmentDeliveryAddressId", values: [envioInfo.ubigeoDestino || '150115'] },
      { alias: "shipmentGrossWeightMeasure", values: ["1"] }
    ]
  }
  
  console.log('📤 Sending guide payload to Bsale:', JSON.stringify(payload, null, 2))
  
  const guideResult = await makeBsaleRequest('shippings.json', payload)
  
  console.log('✅ Guide created:', guideResult)
  
  return {
    guideUrl: guideResult?.guide?.urlPublicView || guideResult?.urlPublicView || null,
    guideNumber: guideResult?.guide?.number || guideResult?.number || null,
    guideId: guideResult?.guide?.id || guideResult?.id || null
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }

  try {
    const { saleId, transportistId } = await req.json()
    console.log(`Processing factura with guide emission for sale: ${saleId}, transportist: ${transportistId || 'none'}`)

    // Initialize Supabase client for auth check
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseAuth = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: req.headers.get('Authorization') }
      }
    })

    // Check authentication and permissions
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // All authenticated users can emit documents (organization-wide policy)

    // Initialize Supabase client for operations
    const supabaseClient = createSupabaseClient()

    // 1. Fetch sale and details FIRST (needed for idempotency check)
    const { data: venta, error: ventaError } = await supabaseClient
      .from('ventas')
      .select('*')
      .eq('id', saleId)
      .single()

    const { data: ventaDetails, error: detailsError } = await supabaseClient
      .from('ventas_detalle')
      .select('*')
      .eq('venta_id', saleId)

    if (ventaError) {
      throw new Error(`Venta not found: ${ventaError.message}`)
    }

    if (detailsError) {
      throw new Error(`Error fetching venta details: ${detailsError.message}`)
    }

    // 2. IDEMPOTENCY: Check if document already exists BEFORE verifying assignments
    if (venta.id_bsale_documento) {
      console.log(`⚠️ [IDEMPOTENCY] Document already exists for sale ${saleId}: ${venta.id_bsale_documento}`)
      
      // If already archived, return existing data
      if (venta.estado === 'archivado') {
        console.log('✅ Sale already archived, returning existing document data')
        
        // IDEMPOTENCY FIX: Check if ventas_detalle needs updating even for archived sales
        const detailsNeedUpdate = ventaDetails.some(d => !d.detail_id_bsale)
        if (detailsNeedUpdate && venta.id_bsale_documento) {
          console.log('📝 Updating ventas_detalle with Bsale IDs (archived sale retry)...')
          try {
            const documentDetails = await fetchDocumentDetails(
              venta.id_bsale_documento, 
              Deno.env.get('BSALE_ACCESS_TOKEN')!
            )
            await updateVentaDetalleWithBsaleIds(supabaseClient, saleId, documentDetails)
            console.log('✅ ventas_detalle updated successfully on archived sale retry')
          } catch (detailError) {
            console.error('⚠️ Warning: Could not update ventas_detalle on archived sale retry:', detailError)
          }
        }
        
        return new Response(
          JSON.stringify({
            success: true,
            urlPublicView: venta.url_public_view,
            documentId: venta.id_bsale_documento,
            serialNumber: venta.serial_number,
            detailsHref: venta.details_href,
            urlGuidesPdf: venta.url_guia_remision || null,
            message: 'Factura con guía ya emitida anteriormente'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }
      
      // If document exists but not archived, complete pending steps
      console.log('🔄 Document exists but not archived, completing pending steps...')
      try {
        const detailsNeedUpdate = ventaDetails.some(d => !d.detail_id_bsale)
        if (detailsNeedUpdate && venta.id_bsale_documento) {
          console.log('📝 Updating ventas_detalle with Bsale IDs (retry)...')
          try {
            const documentDetails = await fetchDocumentDetails(
              venta.id_bsale_documento, 
              Deno.env.get('BSALE_ACCESS_TOKEN')!
            )
            await updateVentaDetalleWithBsaleIds(supabaseClient, saleId, documentDetails)
            console.log('✅ ventas_detalle updated successfully on retry')
          } catch (detailError) {
            console.error('⚠️ Warning: Could not update ventas_detalle on retry:', detailError)
          }
        }

        const { data: existingAssignments } = await supabaseClient
          .from('ventas_asignaciones')
          .select('id')
          .eq('venta_id', saleId)
          .limit(1)

        if (existingAssignments && existingAssignments.length > 0) {
          console.log('📦 Consuming stock from reserved (retry)...')
          await consumeStockFromReserved(supabaseClient, saleId)
          console.log('✅ Stock consumed successfully on retry')
          
          await supabaseClient.from('ventas_asignaciones').delete().eq('venta_id', saleId)
        } else {
          console.log('⚠️ No assignments found - stock already consumed in previous attempt')
        }
        
        await supabaseClient
          .from('ventas')
          .update({ estado: 'archivado', updated_at: new Date().toISOString() })
          .eq('id', saleId)
        
        return new Response(
          JSON.stringify({
            success: true,
            urlPublicView: venta.url_public_view,
            documentId: venta.id_bsale_documento,
            serialNumber: venta.serial_number,
            detailsHref: venta.details_href,
            urlGuidesPdf: venta.url_guia_remision || null,
            message: 'Factura con guía completada exitosamente (reintento de consumo de stock)'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      } catch (error) {
        console.error('❌ Stock consumption retry failed:', error)
        throw new Error(`Reintento de consumo de stock falló: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // 3. ONLY for new emissions: Verify assignments exist
    console.log('🔍 [EMIT-FACTURA-WITH-GUIDE] Verifying assignments exist (new emission)...')
    const { data: verifyResult, error: verifyError } = await supabaseClient.rpc(
      'verify_sale_assignments',
      { sale_id_param: saleId }
    )

    if (verifyError) {
      console.error('❌ Verification failed:', verifyError)
      throw new Error(`Error al verificar asignaciones: ${verifyError.message}`)
    }

    if (!verifyResult || !verifyResult.has_assignments) {
      console.error('❌ No assignments found for sale')
      throw new Error(
        'No se pueden emitir documentos sin asignaciones de bins. ' +
        'Por favor, verifica que la venta tenga stock asignado correctamente.'
      )
    }

    console.log('✅ Assignments verified:', verifyResult)

    // 4. Validate data
    validateSaleData(venta, ventaDetails)

    // 5. Get payment type and variants
    const paymentTypeId = await getPaymentTypeId(supabaseClient, venta.metodo_pago)
    const skus = ventaDetails.map(d => d.sku)
    const variants = await getVariantsData(supabaseClient, skus)

    // 6. Calculate emission date and build details
    const emissionDate = calculateEmissionDate()
    const details = buildDocumentDetails(ventaDetails, variants)

    // 7. Build and send Bsale payload (with dispatch: 0 to indicate guide needed)
    const payload = buildFacturaPayload(venta, details, paymentTypeId, emissionDate, true)
    const bsaleResult = await makeBsaleRequest('documents.json', payload)

    // 8. Check for urlPublicView in response
    if (!bsaleResult.urlPublicView) {
      throw new Error('Bsale response does not contain urlPublicView')
    }

    // 9. CRITICAL IDEMPOTENCY: Save Bsale document data IMMEDIATELY
    console.log('💾 [IDEMPOTENCY] Saving Bsale document data immediately...')
    const updateDataImmediate: any = {
      documento_tipo: 'factura',
      requiere_guia_remision: true,
      url_public_view: bsaleResult.urlPublicView,
      serial_number: bsaleResult.serialNumber,
      details_href: bsaleResult.href,
      id_bsale_documento: bsaleResult.id,
      estado: 'documento_emitido',
      updated_at: new Date().toISOString()
    }

    const { error: saveDocError } = await supabaseClient
      .from('ventas')
      .update(updateDataImmediate)
      .eq('id', saleId)

    if (saveDocError) {
      console.error('⚠️ Warning: Error saving document data:', saveDocError)
    } else {
      console.log('✅ Document data saved successfully')
    }

    // 10. Fetch document details and update ventas_detalle
    let documentDetails: any[] = []
    try {
      documentDetails = await fetchDocumentDetails(bsaleResult.id, Deno.env.get('BSALE_ACCESS_TOKEN')!)
      await updateVentaDetalleWithBsaleIds(supabaseClient, saleId, documentDetails)
    } catch (error) {
      console.error('Error updating document details:', error)
    }

    // 11. CREATE REMISSION GUIDE if transportistId provided
    let guideUrl: string | null = null
    let guideNumber: string | null = null
    
    if (transportistId) {
      console.log('🚚 [EMIT-FACTURA-WITH-GUIDE] Creating remission guide with transportist:', transportistId)
      try {
        const guideResult = await createRemissionGuide(
          supabaseClient,
          venta,
          ventaDetails,
          documentDetails,
          transportistId,
          emissionDate
        )
        guideUrl = guideResult.guideUrl
        guideNumber = guideResult.guideNumber
        
        // Update venta with guide info
        await supabaseClient
          .from('ventas')
          .update({
            url_guia_remision: guideUrl,
            guia_remision: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', saleId)
        
        console.log('✅ Guide created and saved:', guideUrl)
      } catch (guideError) {
        console.error('❌ Error creating remission guide:', guideError)
        // Non-critical - document was emitted, guide failed
      }
    } else {
      console.log('⚠️ No transportistId provided - guide will need to be created manually')
    }

    // 12. Consume stock from RESERVED
    console.log('📦 [EMIT-FACTURA-WITH-GUIDE] Consuming stock from reserved...')
    try {
      await consumeStockFromReserved(supabaseClient, saleId)
      console.log('✅ Stock consumed successfully from reserved')
    } catch (error) {
      console.error('❌ [EMIT-FACTURA-WITH-GUIDE] Stock consumption failed:', error)
      throw new Error(`Stock consumption failed: ${error instanceof Error ? error.message : String(error)}`)
    }

    // 13. Delete assignments AFTER consumption
    console.log('🗑️ [EMIT-FACTURA-WITH-GUIDE] Deleting assignments after successful consumption...')
    const { error: deleteAssignmentsError } = await supabaseClient
      .from('ventas_asignaciones')
      .delete()
      .eq('venta_id', saleId)
    
    if (deleteAssignmentsError) {
      console.error('⚠️ Warning: Could not delete assignments:', deleteAssignmentsError)
    } else {
      console.log('✅ Assignments deleted successfully')
    }

    // 14. Archive sale
    console.log('📁 [ARCHIVING] Updating estado to archivado...')
    const { error: updateError } = await supabaseClient
      .from('ventas')
      .update({
        estado: 'archivado',
        updated_at: new Date().toISOString()
      })
      .eq('id', saleId)

    if (updateError) {
      console.error('Error updating venta status:', updateError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        urlPublicView: bsaleResult.urlPublicView,
        documentId: bsaleResult.id,
        serialNumber: bsaleResult.serialNumber,
        detailsHref: bsaleResult.href,
        urlGuidesPdf: guideUrl,
        guideNumber: guideNumber,
        message: guideUrl 
          ? 'Factura con guía emitida exitosamente' 
          : 'Factura emitida - Guía pendiente de emisión manual'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error emitting factura with guide:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})
