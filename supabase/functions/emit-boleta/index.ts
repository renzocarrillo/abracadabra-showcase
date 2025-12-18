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
import { makeBsaleRequest, buildBoletaPayload } from '../_shared/bsale-api.ts'
import { consumeStockFromReserved } from '../_shared/stock-management.ts'
import { checkUserPermission } from '../_shared/permission-helpers.ts'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }

  try {
    const { saleId } = await req.json()
    console.log(`Processing boleta emission for sale: ${saleId}`)

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
    console.log('🔍 [EMIT-BOLETA] Verifying assignments exist...')
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

    // IDEMPOTENCY: Check if document already exists
    if (venta.id_bsale_documento) {
      console.log(`⚠️ [IDEMPOTENCY] Document already exists for sale ${saleId}: ${venta.id_bsale_documento}`)
      
      // If already archived, return existing data
      if (venta.estado === 'archivado') {
        console.log('✅ Sale already archived, returning existing document data')
        return new Response(
          JSON.stringify({
            success: true,
            urlPublicView: venta.url_public_view,
            documentId: venta.id_bsale_documento,
            serialNumber: venta.serial_number,
            detailsHref: venta.details_href,
            message: 'Boleta ya emitida anteriormente'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }
      
      // If document exists but not archived, complete pending steps
      console.log('🔄 Document exists but not archived, completing pending steps...')
      try {
        // IDEMPOTENCY FIX: Check if ventas_detalle needs updating
        const detailsNeedUpdate = ventaDetails.some(d => !d.detail_id_bsale)
        if (detailsNeedUpdate && venta.id_bsale_documento) {
          console.log('📝 Updating ventas_detalle with Bsale IDs (retry)...')
          try {
            const documentDetails = await fetchDocumentDetails(
              venta.id_bsale_documento, 
              Deno.env.get('BSALE_ACCESS_TOKEN')!
            )
            await updateVentaDetalleWithBsaleIds(supabase, saleId, documentDetails)
            console.log('✅ ventas_detalle updated successfully on retry')
          } catch (detailError) {
            console.error('⚠️ Warning: Could not update ventas_detalle on retry:', detailError)
            // Non-critical, continue with remaining steps
          }
        }

        // IDEMPOTENCY FIX: Check if assignments exist before consuming stock
        const { data: existingAssignments } = await supabase
          .from('ventas_asignaciones')
          .select('id')
          .eq('venta_id', saleId)
          .limit(1)

        if (existingAssignments && existingAssignments.length > 0) {
          console.log('📦 Consuming stock from reserved (retry)...')
          await consumeStockFromReserved(supabase, saleId)
          console.log('✅ Stock consumed successfully on retry')
          
          // Delete assignments
          await supabase.from('ventas_asignaciones').delete().eq('venta_id', saleId)
        } else {
          console.log('⚠️ No assignments found - stock already consumed in previous attempt')
        }
        
        // Archive sale
        await supabase
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
            message: 'Boleta completada exitosamente (reintento de consumo de stock)'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      } catch (error) {
        console.error('❌ Stock consumption retry failed:', error)
        throw new Error(`Reintento de consumo de stock falló: ${error instanceof Error ? error.message : String(error)}`)
      }
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

    // 5. Build and send Bsale payload
    const payload = buildBoletaPayload(venta, ventaDetails, details, paymentTypeId, emissionDate, false)
    const bsaleResult = await makeBsaleRequest('documents.json', payload)

    // 6. Check for urlPublicView in response
    if (!bsaleResult.urlPublicView) {
      throw new Error('Bsale response does not contain urlPublicView')
    }

    // 6.5. CRITICAL IDEMPOTENCY: Save Bsale document data IMMEDIATELY
    // If stock consumption fails, retry will find id_bsale_documento and skip Bsale call
    console.log('💾 [IDEMPOTENCY] Saving Bsale document data immediately...')
    const { error: saveDocError } = await supabase
      .from('ventas')
      .update({
        documento_tipo: 'boleta',
        requiere_guia_remision: false,
        url_public_view: bsaleResult.urlPublicView,
        serial_number: bsaleResult.serialNumber,
        details_href: bsaleResult.href,
        id_bsale_documento: bsaleResult.id,
        estado: 'documento_emitido', // Intermediate state, not archived yet
        updated_at: new Date().toISOString()
      })
      .eq('id', saleId)

    if (saveDocError) {
      console.error('⚠️ Warning: Error saving document data (document already emitted in Bsale):', saveDocError)
      // Non-critical, document exists in Bsale
    } else {
      console.log('✅ Document data saved successfully')
    }

    // 7. Fetch document details and update ventas_detalle
    try {
      const documentDetails = await fetchDocumentDetails(bsaleResult.id, Deno.env.get('BSALE_ACCESS_TOKEN')!)
      await updateVentaDetalleWithBsaleIds(supabase, saleId, documentDetails)
    } catch (error) {
      console.error('Error updating document details:', error)
    }

    // 9. Consume stock from RESERVED (new 2-state system)
    console.log('📦 [EMIT-BOLETA] Consuming stock from reserved...')
    try {
      await consumeStockFromReserved(supabase, saleId)
      console.log('✅ Stock consumed successfully from reserved')
    } catch (error) {
      console.error('❌ [EMIT-BOLETA] Stock consumption failed:', error)
      throw new Error(`Stock consumption failed: ${error instanceof Error ? error.message : String(error)}`)
    }

    // 9.5. Delete assignments AFTER consumption, BEFORE archiving
    // This prevents the auto_cleanup_archived_stock trigger from attempting to release already-consumed stock
    console.log('🗑️ [EMIT-BOLETA] Deleting assignments after successful consumption...')
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

    // 10. Archive sale AFTER successful stock consumption
    // Document data was already saved in step 6.5
    console.log('📁 [ARCHIVING] Updating estado to archivado...')
    const { error: archiveError } = await supabase
      .from('ventas')
      .update({
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
        message: 'Boleta emitida exitosamente'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error emitting boleta:', error)
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