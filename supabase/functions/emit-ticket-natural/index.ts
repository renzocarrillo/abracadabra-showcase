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
import { makeBsaleRequest, buildTicketNaturalPayload } from '../_shared/bsale-api.ts'
import { consumeStockFromReserved } from '../_shared/stock-management.ts'
import { checkUserPermission } from '../_shared/permission-helpers.ts'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }

  try {
    const { saleId } = await req.json()
    console.log(`Processing ticket natural emission for sale: ${saleId}`)

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
    const supabase = createSupabaseClient()

    // 0. CRITICAL: Verify assignments exist before allowing emission
    console.log('🔍 [EMIT-TICKET-NATURAL] Verifying assignments exist...')
    const { data: verifyResult, error: verifyError } = await supabase.rpc(
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
        'No se pueden emitir documentos sin asignaciones de bins. Por favor, verifica que la venta tenga stock asignado correctamente.'
      )
    }
    console.log('✅ Assignments verified:', verifyResult)

    // 1. Fetch sale and details
    const { data: venta, error: ventaError } = await supabase
      .from('ventas')
      .select('*')
      .eq('id', saleId)
      .single()

    const { data: ventaDetails, error: detailsError } = await supabase
      .from('ventas_detalle')
      .select('*')
      .eq('venta_id', saleId)

    if (ventaError) {
      throw new Error(`Venta not found: ${ventaError.message}`)
    }

    if (detailsError) {
      throw new Error(`Error fetching venta details: ${detailsError.message}`)
    }

    // 2. Validate data
    validateSaleData(venta, ventaDetails)

    // 3. Get payment type and variants
    const paymentTypeId = await getPaymentTypeId(supabase, venta.metodo_pago)
    const skus = ventaDetails.map(d => d.sku)
    const variants = await getVariantsData(supabase, skus)

    // 4. Calculate emission date and build details
    const emissionDate = calculateEmissionDate()
    const details = buildDocumentDetails(ventaDetails, variants)

    // 5. Build and send Bsale payload for ticket natural
    const payload = buildTicketNaturalPayload(venta, ventaDetails, details, paymentTypeId, emissionDate)
    const bsaleResult = await makeBsaleRequest('documents.json', payload)

    // 6. Check for urlPublicView in response
    if (!bsaleResult.urlPublicView) {
      throw new Error('Bsale response does not contain urlPublicView')
    }

    // 7. (Moved) Update sale after successful stock consumption
    //    We delay archiving until stock is consumed to avoid race conditions with assignments.


    // 8. Fetch document details and update ventas_detalle
    try {
      const documentDetails = await fetchDocumentDetails(bsaleResult.id, Deno.env.get('BSALE_ACCESS_TOKEN')!)
      await updateVentaDetalleWithBsaleIds(supabase, saleId, documentDetails)
    } catch (error) {
      console.error('Error updating document details:', error)
    }

    // 9. Consume stock from RESERVED (new 2-state system)
    console.log('📦 [EMIT-TICKET-NATURAL] Consuming stock from reserved...')
    try {
      await consumeStockFromReserved(supabase, saleId)
      console.log('✅ Stock consumed successfully from reserved')
    } catch (error) {
      console.error('❌ [EMIT-TICKET-NATURAL] Stock consumption failed:', error)
      throw new Error(`Stock consumption failed: ${error instanceof Error ? error.message : String(error)}`)
    }

    // 9.5. Delete assignments AFTER consumption, BEFORE archiving
    // This prevents the auto_cleanup_archived_stock trigger from attempting to release already-consumed stock
    console.log('🗑️ [EMIT-TICKET-NATURAL] Deleting assignments after successful consumption...')
    const { error: deleteAssignmentsError } = await supabase
      .from('ventas_asignaciones')
      .delete()
      .eq('venta_id', saleId)
    
    if (deleteAssignmentsError) {
      console.error('⚠️ Warning: Could not delete assignments:', deleteAssignmentsError)
      // Non-critical error, continue with archiving
    } else {
      console.log('✅ Assignments deleted successfully')
    }

    // 10. Update sale with document information and archive AFTER consumption
    const { error: archiveError } = await supabase
      .from('ventas')
      .update({
        documento_tipo: 'ticket',
        requiere_guia_remision: false,
        url_public_view: bsaleResult.urlPublicView,
        serial_number: bsaleResult.serialNumber,
        details_href: bsaleResult.href,
        id_bsale_documento: bsaleResult.id,
        estado: 'archivado',
        updated_at: new Date().toISOString()
      })
      .eq('id', saleId)

    if (archiveError) {
      console.error('Error updating venta status:', archiveError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        urlPublicView: bsaleResult.urlPublicView,
        documentId: bsaleResult.id,
        serialNumber: bsaleResult.serialNumber,
        detailsHref: bsaleResult.href,
        message: 'Ticket emitido exitosamente'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error emitting ticket natural:', error)
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