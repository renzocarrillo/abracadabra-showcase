import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.1'
import { corsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts'
import { createSupabaseClient } from '../_shared/supabase-client.ts'
import { consumeStockFromReserved } from '../_shared/stock-management.ts'
import { checkUserPermission } from '../_shared/permission-helpers.ts'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }

  try {
    const { saleId } = await req.json()
    console.log(`🔵 [EMIT-GUIDE-REMISION] Processing guide emission for sale: ${saleId}`)

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

    // 0. CRITICAL: Verify assignments exist before allowing guide emission
    console.log('🔍 [EMIT-GUIDE] Verifying assignments exist...')
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
        'No se puede emitir la guía sin asignaciones de bins. ' +
        'Por favor, contacta a un supervisor.'
      )
    }

    console.log('✅ Assignments verified:', verifyResult)

    // 1. Fetch venta and validate it has a document emitted
    const { data: venta, error: ventaError } = await supabaseClient
      .from('ventas')
      .select('*')
      .eq('id', saleId)
      .single()

    if (ventaError || !venta) {
      throw new Error(`Venta not found: ${ventaError?.message}`)
    }

    if (!venta.documento_tipo || !venta.url_public_view) {
      throw new Error('No se puede emitir guía sin documento principal')
    }

    if (!venta.requiere_guia_remision) {
      throw new Error('Esta venta no requiere guía de remisión')
    }

    if (venta.guia_remision) {
      throw new Error('La guía de remisión ya fue emitida para esta venta')
    }

    if (venta.estado === 'archivado') {
      throw new Error('Esta venta ya fue archivada')
    }

    // 2. Fetch venta details
    const { data: ventaDetails, error: detailsError } = await supabaseClient
      .from('ventas_detalle')
      .select('*')
      .eq('venta_id', saleId)

    if (detailsError) {
      throw new Error(`Error fetching venta details: ${detailsError.message}`)
    }

    // 3. Get variant prices for netUnitValue calculation
    const skus = ventaDetails.map(d => d.sku)
    const { data: variants, error: variantError } = await supabaseClient
      .from('variants')
      .select('sku, variant_value_12')
      .in('sku', skus)

    if (variantError) {
      throw new Error(`Error fetching variants: ${variantError.message}`)
    }

    // 3.5. CRITICAL VERIFICATION: Check if assignments exist before continuing
    console.log('🔍 [EMIT-GUIDE] Verificando asignaciones antes de emitir guía...')
    const { data: assignmentCheck, error: assignCheckError } = await supabaseClient
      .from('ventas_asignaciones')
      .select('id, sku, bin, cantidad_asignada')
      .eq('venta_id', saleId)
    
    if (assignCheckError) {
      console.error('❌ [EMIT-GUIDE] Error verificando asignaciones:', assignCheckError)
      throw new Error(`Error al verificar asignaciones: ${assignCheckError.message}`)
    }
    
    console.log(`🔍 [EMIT-GUIDE] Asignaciones encontradas: ${assignmentCheck?.length || 0}`)
    
    if (!assignmentCheck || assignmentCheck.length === 0) {
      console.error('❌ [EMIT-GUIDE] CRÍTICO: No hay asignaciones para esta venta')
      console.error('❌ [EMIT-GUIDE] Venta:', venta.venta_id)
      console.error('❌ [EMIT-GUIDE] Estado actual:', venta.estado)
      console.error('❌ [EMIT-GUIDE] Revisando historial de asignaciones...')
      
      // Intentar obtener historial de asignaciones
      try {
        const { data: history } = await supabaseClient.rpc('get_assignment_history', {
          venta_codigo_param: venta.venta_id
        })
        console.error('📋 [EMIT-GUIDE] Historial de asignaciones:', history)
      } catch (e) {
        console.error('Error obteniendo historial:', e)
      }
      
      throw new Error(
        `No se pueden emitir guía: No existen asignaciones de stock para venta ${venta.venta_id}. ` +
        `Las asignaciones pueden haber sido eliminadas prematuramente. ` +
        `Revisa ventas_asignaciones_audit para el historial completo.`
      )
    }
    
    console.log('✅ [EMIT-GUIDE] Asignaciones verificadas:', assignmentCheck)

    // 4. Calculate dates (today at 00:00:00 UTC in epoch seconds)
    const today = new Date()
    const emissionDate = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 1000)

    // 5. Build guide details
    const details = ventaDetails.map(item => {
      // Find variant price or use modified price from venta_detalle
      const variant = variants.find(v => v.sku === item.sku)
      const precioBruto = item.precio_unitario // This is the price with IGV
      const netUnitValue = Number((precioBruto / 1.18).toFixed(6)) // At least 6 decimals

      return {
        code: item.sku,
        quantity: item.cantidad,
        netUnitValue: netUnitValue,
        taxId: "[1]", // IGV
        discount: 0
      }
    })

    // 6. Get client and shipping info
    const clienteInfo = venta.cliente_info || {}
    const envioInfo = venta.envio_info || {}
    
    // 7. Build Bsale guide payload
    const payload = {
      documentTypeId: 117, // Guía de remisión
      officeId: 17, // ALMCENTRAL
      priceListId: 31, // Lista por mayor
      emissionDate: emissionDate,
      expirationDate: emissionDate,
      declare: 1,
      dispatch: 1, // Always dispatch immediately for guides
      client: {
        code: clienteInfo.ruc || clienteInfo.code,
        email: clienteInfo.email,
        firstName: clienteInfo.firstName || '',
        lastName: clienteInfo.lastName || ''
      },
      sendEmail: 1,
      details: details,
      // Guide-specific fields
      address: envioInfo.direccion || clienteInfo.direccion || 'Dirección no especificada',
      municipality: envioInfo.distrito || clienteInfo.distrito || 'Lima',
      city: envioInfo.provincia || clienteInfo.provincia || 'Lima'
    }

    console.log('Sending guide payload to Bsale:', JSON.stringify(payload, null, 2))

    // 8. POST to Bsale API
    const bsaleAccessToken = Deno.env.get('BSALE_ACCESS_TOKEN');
    const bsaleResponse = await fetch('https://api.bsale.io/v1/documents.json', {
      method: 'POST',
      headers: {
        'access_token': bsaleAccessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    const bsaleResult = await bsaleResponse.json()
    console.log('Bsale guide response:', bsaleResult)

    if (!bsaleResponse.ok) {
      throw new Error(`Bsale API error: ${JSON.stringify(bsaleResult)}`)
    }

    // 9. Check for urlPublicView in response
    if (!bsaleResult.urlPublicView) {
      throw new Error('Bsale response does not contain urlPublicView')
    }

    // 10. CRITICAL: Consume stock from RESERVED (new 2-state system)
    console.log('📦 [EMIT-GUIDE] Consuming stock from reserved...')
    try {
      await consumeStockFromReserved(supabaseClient, saleId)
      console.log('✅ Stock consumed successfully from reserved')
    } catch (error) {
      console.error('❌ [EMIT-GUIDE] Stock consumption failed:', error)
      throw new Error(`Stock consumption failed: ${error instanceof Error ? error.message : String(error)}`)
    }

    // 10.5. Delete assignments AFTER consumption, BEFORE archiving
    // This prevents the auto_cleanup_archived_stock trigger from attempting to release already-consumed stock
    console.log('🗑️ [EMIT-GUIDE] Deleting assignments after successful consumption...')
    const { error: deleteAssignmentsError } = await supabaseClient
      .from('ventas_asignaciones')
      .delete()
      .eq('venta_id', saleId)
    
    if (deleteAssignmentsError) {
      console.error('⚠️ Warning: Could not delete assignments:', deleteAssignmentsError)
      // Non-critical error, continue with archiving
    } else {
      console.log('✅ Assignments deleted successfully')
    }

    // 11. NOW archive the sale (after stock consumption)
    console.log('Archiving sale after successful stock consumption')
    const { error: archiveError } = await supabaseClient
      .from('ventas')
      .update({
        guia_remision: true,
        estado: 'archivado',
        updated_at: new Date().toISOString()
      })
      .eq('id', saleId)

    if (archiveError) {
      console.error('Error updating venta status:', archiveError)
      throw new Error(`Failed to archive sale: ${archiveError.message}`)
    }

    // 12. Log audit trail
    try {
      await supabaseClient.rpc('log_venta_state_change', {
        p_venta_id: saleId,
        p_venta_codigo: venta.venta_id,
        p_accion: 'guia_emitida',
        p_estado_anterior: 'documento_emitido',
        p_estado_nuevo: 'archivado',
        p_usuario_id: null,
        p_usuario_nombre: 'Sistema - Guía de Remisión',
        p_detalles: JSON.stringify({
          numero_guia: bsaleResult.number || 'N/A',
          url_guia: bsaleResult.urlPublicView,
          stock_consumption_method: 'strict',
          message: 'Stock consumido exitosamente desde comprometido'
        })
      });
    } catch (auditError) {
      console.error('Error logging audit trail (non-critical):', auditError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        urlPublicView: bsaleResult.urlPublicView,
        documentId: bsaleResult.id,
        serialNumber: bsaleResult.serialNumber,
        message: 'Guía de remisión emitida exitosamente'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error emitting guide:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})