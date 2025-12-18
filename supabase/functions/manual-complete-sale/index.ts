import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { saleCode } = await req.json()
    
    if (!saleCode) {
      throw new Error('Sale code is required')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log(`[MANUAL COMPLETE] Processing sale: ${saleCode}`)

    // Get sale
    const { data: sale, error: saleError } = await supabase
      .from('ventas')
      .select('*')
      .eq('venta_id', saleCode)
      .maybeSingle()

    if (saleError || !sale) {
      throw new Error(`Sale not found: ${saleCode}`)
    }

    console.log(`Found sale ${saleCode} with status: ${sale.estado}`)

    // Get sale details
    const { data: details, error: detailsError } = await supabase
      .from('ventas_detalle')
      .select('*')
      .eq('venta_id', sale.id)

    if (detailsError || !details || details.length === 0) {
      throw new Error(`No details found for sale: ${saleCode}`)
    }

    console.log(`Processing ${details.length} items`)

    const processedItems: any[] = []

    // Process each item
    for (const detail of details) {
      console.log(`Processing SKU ${detail.sku}, quantity: ${detail.cantidad}`)
      
      let remainingQty = detail.cantidad

      // Get available stock for this SKU, ordered by bin (FIFO)
      const { data: stockRecords, error: stockError } = await supabase
        .from('stockxbin')
        .select('*')
        .eq('sku', detail.sku)
        .gt('disponibles', 0)
        .order('bin', { ascending: true })

      if (stockError) {
        console.error(`Error fetching stock for SKU ${detail.sku}:`, stockError)
        continue
      }

      if (!stockRecords || stockRecords.length === 0) {
        console.warn(`No available stock found for SKU ${detail.sku}`)
        processedItems.push({
          sku: detail.sku,
          requested: detail.cantidad,
          consumed: 0,
          status: 'insufficient_stock'
        })
        continue
      }

      const consumedFromBins: any[] = []

      // Consume stock from bins using FIFO
      for (const stockRecord of stockRecords) {
        if (remainingQty <= 0) break

        const availableInBin = stockRecord.disponibles
        const toConsume = Math.min(remainingQty, availableInBin)

        // Update stock in this bin
        const newDisponibles = stockRecord.disponibles - toConsume
        const newComprometido = Math.max(0, stockRecord.comprometido - toConsume)
        const newEnExistencia = stockRecord.en_existencia - toConsume

        const { error: updateError } = await supabase
          .from('stockxbin')
          .update({
            disponibles: newDisponibles,
            comprometido: newComprometido,
            en_existencia: newEnExistencia,
            updated_at: new Date().toISOString()
          })
          .eq('id', stockRecord.id)

        if (updateError) {
          console.error(`Error updating stock for bin ${stockRecord.bin}:`, updateError)
        } else {
          console.log(`Consumed ${toConsume} units of SKU ${detail.sku} from bin ${stockRecord.bin}`)
          consumedFromBins.push({
            bin: stockRecord.bin,
            quantity: toConsume
          })
          remainingQty -= toConsume
        }
      }

      // Update stock_totals for this SKU
      const { data: totalsAgg, error: totalsError } = await supabase
        .from('stockxbin')
        .select('disponibles, comprometido, en_existencia')
        .eq('sku', detail.sku)

      if (!totalsError && totalsAgg) {
        const totalDisponible = totalsAgg.reduce((sum, row) => sum + (row.disponibles || 0), 0)
        const totalComprometido = totalsAgg.reduce((sum, row) => sum + (row.comprometido || 0), 0)
        const totalEnExistencia = totalsAgg.reduce((sum, row) => sum + (row.en_existencia || 0), 0)

        await supabase
          .from('stock_totals')
          .upsert({
            sku: detail.sku,
            total_disponible: totalDisponible,
            total_comprometido: totalComprometido,
            total_en_existencia: totalEnExistencia,
            updated_at: new Date().toISOString()
          }, { onConflict: 'sku' })

        console.log(`Updated stock_totals for SKU ${detail.sku}: disponible=${totalDisponible}, comprometido=${totalComprometido}, en_existencia=${totalEnExistencia}`)
      }

      processedItems.push({
        sku: detail.sku,
        requested: detail.cantidad,
        consumed: detail.cantidad - remainingQty,
        bins: consumedFromBins,
        status: remainingQty > 0 ? 'partial' : 'complete'
      })
    }

    // Mark sale as archived if not already
    if (sale.estado !== 'archivado') {
      const { error: archiveError } = await supabase
        .from('ventas')
        .update({
          estado: 'archivado',
          updated_at: new Date().toISOString()
        })
        .eq('id', sale.id)

      if (archiveError) {
        console.error('Error archiving sale:', archiveError)
      } else {
        console.log(`Sale ${saleCode} marked as archived`)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        saleCode,
        message: 'Sale completed manually, stock consumed from Abracadabra (no BSale POST)',
        processedItems
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error in manual-complete-sale:', error)
    return new Response(
      JSON.stringify({
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
