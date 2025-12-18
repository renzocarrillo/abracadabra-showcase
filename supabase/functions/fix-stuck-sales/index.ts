import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.1'
import { corsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts'
import { createSupabaseClient } from '../_shared/supabase-client.ts'

// FASE 3: Edge function de recuperación automática
// Detecta y corrige ventas atascadas en estado documento_emitido

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }

  try {
    const { saleId, autoFix = false } = await req.json()
    
    // Initialize Supabase client for auth check
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseAuth = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: req.headers.get('Authorization') }
      }
    })

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createSupabaseClient()

    // Si se proporciona un saleId específico, solo procesar esa venta
    if (saleId) {
      console.log(`🔍 [FIX-STUCK-SALES] Verificando venta específica: ${saleId}`)
      const result = await fixStuckSale(supabase, saleId, user, autoFix)
      return new Response(
        JSON.stringify(result),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    // Buscar todas las ventas atascadas
    console.log('🔍 [FIX-STUCK-SALES] Buscando ventas atascadas...')
    
    const { data: stuckSales, error: searchError } = await supabase
      .from('ventas')
      .select(`
        id,
        venta_id,
        estado,
        id_bsale_documento,
        serial_number,
        created_at,
        ventas_asignaciones(count)
      `)
      .eq('estado', 'documento_emitido')
      .not('id_bsale_documento', 'is', null)

    if (searchError) {
      throw new Error(`Error buscando ventas atascadas: ${searchError.message}`)
    }

    console.log(`📊 Ventas atascadas encontradas: ${stuckSales?.length || 0}`)

    // Verificar stock reservado para cada venta
    const stuckSalesWithStock = []
    for (const sale of stuckSales || []) {
      const { data: stockData } = await supabase
        .from('stockxbin')
        .select('reservado')
        .in('id', 
          await supabase
            .from('ventas_asignaciones')
            .select('stock_id')
            .eq('venta_id', sale.id)
            .then(res => res.data?.map(a => a.stock_id) || [])
        )

      const hasReservedStock = stockData?.some(s => s.reservado > 0)
      
      if (hasReservedStock || (sale.ventas_asignaciones as any)[0]?.count > 0) {
        stuckSalesWithStock.push({
          ...sale,
          has_reserved_stock: hasReservedStock,
          has_assignments: (sale.ventas_asignaciones as any)[0]?.count > 0
        })
      }
    }

    console.log(`⚠️ Ventas con problemas: ${stuckSalesWithStock.length}`)

    if (!autoFix) {
      return new Response(
        JSON.stringify({
          success: true,
          stuck_sales: stuckSalesWithStock,
          count: stuckSalesWithStock.length,
          message: 'Use autoFix: true para corregir automáticamente'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    // Auto-corregir todas las ventas atascadas
    const results = []
    for (const sale of stuckSalesWithStock) {
      const result = await fixStuckSale(supabase, sale.venta_id, user, true)
      results.push(result)
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
        summary: {
          total: results.length,
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
    console.error('❌ Error en fix-stuck-sales:', error)
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

async function fixStuckSale(supabase: any, ventaId: string, user: any, autoFix: boolean) {
  console.log(`\n🔧 [FIX-STUCK-SALE] Procesando ${ventaId}...`)
  
  try {
    // 1. Obtener venta
    const { data: venta, error: ventaError } = await supabase
      .from('ventas')
      .select('*')
      .eq('venta_id', ventaId)
      .single()

    if (ventaError || !venta) {
      return {
        venta_id: ventaId,
        success: false,
        error: `Venta no encontrada: ${ventaError?.message}`
      }
    }

    // 2. Verificar si está atascada
    if (venta.estado !== 'documento_emitido' || !venta.id_bsale_documento) {
      return {
        venta_id: ventaId,
        success: false,
        error: 'Venta no está atascada (estado correcto o sin documento Bsale)'
      }
    }

    // 3. Verificar asignaciones y stock reservado
    const { data: assignments } = await supabase
      .from('ventas_asignaciones')
      .select('*')
      .eq('venta_id', venta.id)

    const hasAssignments = assignments && assignments.length > 0

    if (!hasAssignments) {
      return {
        venta_id: ventaId,
        success: false,
        error: 'No hay asignaciones que corregir'
      }
    }

    if (!autoFix) {
      return {
        venta_id: ventaId,
        needs_fix: true,
        issues: {
          estado: venta.estado,
          has_bsale_document: !!venta.id_bsale_documento,
          assignments_count: assignments.length
        },
        message: 'Venta requiere corrección. Use autoFix: true para corregir.'
      }
    }

    // 4. Consumir stock reservado
    console.log(`🔵 Consumiendo stock...`)
    const { data: consumeResult, error: consumeError } = await supabase.rpc(
      'consume_stock_from_reserved',
      { sale_id_param: venta.id }
    )

    if (consumeError) {
      console.warn(`⚠️ Error consumiendo stock:`, consumeError)
    } else if (consumeResult?.success) {
      console.log(`✅ Stock consumido`)
    }

    // 5. Eliminar asignaciones
    console.log(`🗑️ Eliminando asignaciones...`)
    const { error: deleteError } = await supabase
      .from('ventas_asignaciones')
      .delete()
      .eq('venta_id', venta.id)

    if (deleteError) {
      console.error(`❌ Error eliminando asignaciones:`, deleteError)
    } else {
      console.log(`✅ Asignaciones eliminadas`)
    }

    // 6. Archivar venta
    console.log(`📦 Archivando venta...`)
    const { error: updateError } = await supabase
      .from('ventas')
      .update({
        estado: 'archivado',
        guia_remision: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', venta.id)

    if (updateError) {
      return {
        venta_id: ventaId,
        success: false,
        error: `Error archivando venta: ${updateError.message}`
      }
    }

    // 7. Audit log
    await supabase
      .from('ventas_audit_log')
      .insert({
        venta_id: venta.id,
        venta_codigo: ventaId,
        accion: 'CORRECCION_AUTOMATICA',
        estado_anterior: 'documento_emitido',
        estado_nuevo: 'archivado',
        usuario_id: user.id,
        usuario_nombre: user.email,
        detalles: {
          motivo: 'Corrección automática de venta atascada',
          assignments_deleted: assignments.length,
          stock_consumed: consumeResult?.success || false,
          timestamp: new Date().toISOString()
        }
      })

    console.log(`✅ Venta ${ventaId} corregida`)
    return {
      venta_id: ventaId,
      success: true,
      message: 'Venta corregida y archivada correctamente',
      details: {
        assignments_deleted: assignments.length,
        stock_consumed: consumeResult?.success || false
      }
    }

  } catch (error) {
    console.error(`❌ Error procesando ${ventaId}:`, error)
    return {
      venta_id: ventaId,
      success: false,
      error: error.message
    }
  }
}
