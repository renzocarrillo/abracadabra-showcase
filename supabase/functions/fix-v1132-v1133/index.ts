import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts'
import { createSupabaseClient } from '../_shared/supabase-client.ts'

// FASE 1: Corrección manual inmediata para V1132 y V1133
// Edge function para corregir las ventas que quedaron en estado inconsistente

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }

  try {
    console.log('🔧 [FIX-V1132-V1133] Iniciando corrección manual...')
    const supabase = createSupabaseClient()
    
    const ventasToFix = ['V1132', 'V1133']
    const results = []

    for (const ventaId of ventasToFix) {
      console.log(`\n📋 [FIX] Procesando venta ${ventaId}...`)
      
      // 1. Verificar estado actual
      const { data: venta, error: ventaError } = await supabase
        .from('ventas')
        .select('*')
        .eq('venta_id', ventaId)
        .single()

      if (ventaError || !venta) {
        console.error(`❌ No se encontró venta ${ventaId}:`, ventaError)
        results.push({
          venta_id: ventaId,
          success: false,
          error: `Venta no encontrada: ${ventaError?.message}`
        })
        continue
      }

      console.log(`📊 Estado actual: ${venta.estado}`)
      console.log(`📄 Documento Bsale ID: ${venta.id_bsale_documento}`)

      // 2. Consumir stock reservado
      console.log(`🔵 Consumiendo stock reservado para ${ventaId}...`)
      const { data: consumeResult, error: consumeError } = await supabase.rpc(
        'consume_stock_from_reserved',
        { sale_id_param: venta.id }
      )

      if (consumeError) {
        console.error(`❌ Error consumiendo stock:`, consumeError)
        results.push({
          venta_id: ventaId,
          success: false,
          error: `Error consumiendo stock: ${consumeError.message}`
        })
        continue
      }

      if (!consumeResult?.success) {
        console.warn(`⚠️ Stock ya fue consumido o no había reservas`)
      } else {
        console.log(`✅ Stock consumido:`, consumeResult)
      }

      // 3. Eliminar asignaciones
      console.log(`🗑️ Eliminando asignaciones de ${ventaId}...`)
      const { error: deleteAssignError } = await supabase
        .from('ventas_asignaciones')
        .delete()
        .eq('venta_id', venta.id)

      if (deleteAssignError) {
        console.error(`❌ Error eliminando asignaciones:`, deleteAssignError)
      } else {
        console.log(`✅ Asignaciones eliminadas`)
      }

      // 4. Actualizar estado de venta a archivado
      console.log(`📦 Archivando venta ${ventaId}...`)
      const { error: updateError } = await supabase
        .from('ventas')
        .update({
          estado: 'archivado',
          guia_remision: true, // Ya tiene guía emitida
          updated_at: new Date().toISOString()
        })
        .eq('id', venta.id)

      if (updateError) {
        console.error(`❌ Error actualizando venta:`, updateError)
        results.push({
          venta_id: ventaId,
          success: false,
          error: `Error actualizando venta: ${updateError.message}`
        })
        continue
      }

      // 5. Registrar en audit log
      console.log(`📝 Registrando en audit log...`)
      const { error: auditError } = await supabase
        .from('ventas_audit_log')
        .insert({
          venta_id: venta.id,
          venta_codigo: ventaId,
          accion: 'CORRECCION_MANUAL',
          estado_anterior: venta.estado,
          estado_nuevo: 'archivado',
          usuario_id: null,
          usuario_nombre: 'Sistema - Fix V1132/V1133',
          detalles: {
            motivo: 'Corrección de venta atascada en estado documento_emitido',
            problema: 'Guía de remisión emitida pero venta no archivada y stock no consumido',
            acciones_realizadas: [
              'Stock reservado consumido',
              'Asignaciones eliminadas',
              'Venta archivada correctamente'
            ],
            documento_bsale_id: venta.id_bsale_documento,
            timestamp: new Date().toISOString()
          }
        })

      if (auditError) {
        console.warn(`⚠️ Error registrando en audit log:`, auditError)
      }

      console.log(`✅ Venta ${ventaId} corregida exitosamente`)
      results.push({
        venta_id: ventaId,
        success: true,
        message: 'Venta corregida y archivada correctamente'
      })
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
        summary: {
          total: ventasToFix.length,
          success: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('❌ Error fatal en corrección:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
