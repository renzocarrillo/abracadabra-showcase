import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts'
import { createSupabaseClient } from '../_shared/supabase-client.ts'

// Función para archivar ventas manualmente sin tocar stock
// Usado cuando el stock ya fue liberado manualmente

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }

  try {
    console.log('🔧 [MANUAL-ARCHIVE] Iniciando archivado manual de ventas...')
    const supabase = createSupabaseClient()
    
    const ventasToArchive = ['V1136', 'V1135', 'V1133', 'V1132']
    const results = []

    for (const ventaId of ventasToArchive) {
      console.log(`\n📋 [ARCHIVE] Procesando venta ${ventaId}...`)
      
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

      // 2. Eliminar asignaciones
      console.log(`🗑️ Eliminando asignaciones de ${ventaId}...`)
      const { error: deleteAssignError } = await supabase
        .from('ventas_asignaciones')
        .delete()
        .eq('venta_id', venta.id)

      if (deleteAssignError) {
        console.error(`❌ Error eliminando asignaciones:`, deleteAssignError)
        results.push({
          venta_id: ventaId,
          success: false,
          error: `Error eliminando asignaciones: ${deleteAssignError.message}`
        })
        continue
      } else {
        console.log(`✅ Asignaciones eliminadas`)
      }

      // 3. Actualizar estado de venta a archivado
      console.log(`📦 Archivando venta ${ventaId}...`)
      const { error: updateError } = await supabase
        .from('ventas')
        .update({
          estado: 'archivado',
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

      // 4. Registrar en audit log
      console.log(`📝 Registrando en audit log...`)
      const { error: auditError } = await supabase
        .from('ventas_audit_log')
        .insert({
          venta_id: venta.id,
          venta_codigo: ventaId,
          accion: 'ARCHIVADO_MANUAL',
          estado_anterior: venta.estado,
          estado_nuevo: 'archivado',
          usuario_id: null,
          usuario_nombre: 'Sistema - Archivado Manual',
          detalles: {
            motivo: 'Archivado manual - Stock ya liberado manualmente',
            acciones_realizadas: [
              'Asignaciones eliminadas',
              'Venta archivada',
              'Stock NO tocado (ya fue liberado manualmente)'
            ],
            timestamp: new Date().toISOString()
          }
        })

      if (auditError) {
        console.warn(`⚠️ Error registrando en audit log:`, auditError)
      }

      console.log(`✅ Venta ${ventaId} archivada exitosamente`)
      results.push({
        venta_id: ventaId,
        success: true,
        message: 'Venta archivada correctamente (sin tocar stock)'
      })
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
        summary: {
          total: ventasToArchive.length,
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
    console.error('❌ Error fatal en archivado:', error)
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
