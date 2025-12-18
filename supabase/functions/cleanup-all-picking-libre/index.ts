import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('🧹 [CLEANUP-ALL] Iniciando limpieza total de picking libre')
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Paso 1: Obtener todas las sesiones activas o en error
    const { data: sessions, error: sessionsError } = await supabase
      .from('picking_libre_sessions')
      .select('id, status, created_by_name, total_items')
      .in('status', ['en_proceso', 'error'])
    
    if (sessionsError) {
      console.error('❌ Error obteniendo sesiones:', sessionsError)
      throw sessionsError
    }

    console.log(`📋 Sesiones a limpiar: ${sessions?.length || 0}`)

    // Paso 2: Obtener items de esas sesiones para liberar stock
    const sessionIds = sessions?.map(s => s.id) || []
    
    if (sessionIds.length === 0) {
      console.log('✅ No hay sesiones que limpiar')
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No hay sesiones activas para limpiar',
          sessionsDeleted: 0,
          stockReleased: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: items, error: itemsError } = await supabase
      .from('picking_libre_items')
      .select('stock_id, quantity, sku, bin_code')
      .in('session_id', sessionIds)
      .not('stock_id', 'is', null)

    if (itemsError) {
      console.error('❌ Error obteniendo items:', itemsError)
      throw itemsError
    }

    console.log(`📦 Items a liberar: ${items?.length || 0}`)

    // Paso 3: Agrupar por stock_id y liberar
    const stockToRelease = new Map<string, number>()
    items?.forEach(item => {
      if (item.stock_id) {
        const current = stockToRelease.get(item.stock_id) || 0
        stockToRelease.set(item.stock_id, current + item.quantity)
      }
    })

    let stockReleasedCount = 0
    for (const [stockId, quantity] of stockToRelease.entries()) {
      console.log(`🔓 Liberando stock_id: ${stockId}, cantidad: ${quantity}`)
      
      const { data: currentStock } = await supabase
        .from('stockxbin')
        .select('reservado, disponibles')
        .eq('id', stockId)
        .single()

      if (currentStock) {
        const newReservado = Math.max(0, currentStock.reservado - quantity)
        const newDisponibles = currentStock.disponibles + quantity

        await supabase
          .from('stockxbin')
          .update({
            reservado: newReservado,
            disponibles: newDisponibles,
            updated_at: new Date().toISOString(),
          })
          .eq('id', stockId)

        stockReleasedCount++
        console.log(`✅ Stock liberado: ${stockId} -> reservado: ${newReservado}, disponibles: ${newDisponibles}`)
      }
    }

    // Paso 4: Eliminar items
    const { error: deleteItemsError } = await supabase
      .from('picking_libre_items')
      .delete()
      .in('session_id', sessionIds)

    if (deleteItemsError) {
      console.error('❌ Error eliminando items:', deleteItemsError)
    } else {
      console.log('✅ Items eliminados')
    }

    // Paso 5: Eliminar sesiones
    const { error: deleteSessionsError } = await supabase
      .from('picking_libre_sessions')
      .delete()
      .in('id', sessionIds)

    if (deleteSessionsError) {
      console.error('❌ Error eliminando sesiones:', deleteSessionsError)
      throw deleteSessionsError
    }

    console.log('✅ Sesiones eliminadas')
    console.log('🎉 Limpieza total completada')

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Limpieza completada exitosamente',
        sessionsDeleted: sessions.length,
        stockReleased: stockReleasedCount,
        details: {
          sessions: sessions.map(s => ({
            id: s.id,
            status: s.status,
            user: s.created_by_name,
            items: s.total_items,
          })),
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Error en limpieza:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
