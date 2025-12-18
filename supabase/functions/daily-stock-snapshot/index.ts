import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log('Starting daily stock snapshot generation...')

    // Calculate total stock by summing from stockxbin (en_existencia)
    const { data: stockData, error: stockError } = await supabase
      .from('stockxbin')
      .select('en_existencia')
    
    if (stockError) {
      console.error('Error fetching stock data:', stockError)
      throw stockError
    }

    // Sum all stock quantities
    const totalStock = stockData?.reduce((sum, record) => sum + (record.en_existencia || 0), 0) || 0
    
    console.log(`Calculated total stock: ${totalStock}`)

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0]

    // Check if snapshot already exists for today
    const { data: existingSnapshot } = await supabase
      .from('daily_stock_snapshots')
      .select('id')
      .eq('snapshot_date', today)
      .single()

    if (existingSnapshot) {
      // Update existing snapshot
      const { error: updateError } = await supabase
        .from('daily_stock_snapshots')
        .update({ 
          total_stock: totalStock,
          updated_at: new Date().toISOString()
        })
        .eq('snapshot_date', today)

      if (updateError) {
        console.error('Error updating snapshot:', updateError)
        throw updateError
      }

      console.log(`Updated existing snapshot for ${today}`)
    } else {
      // Insert new snapshot
      const { error: insertError } = await supabase
        .from('daily_stock_snapshots')
        .insert({
          snapshot_date: today,
          total_stock: totalStock,
        })

      if (insertError) {
        console.error('Error inserting snapshot:', insertError)
        throw insertError
      }

      console.log(`Created new snapshot for ${today}`)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Daily stock snapshot saved successfully`,
        date: today,
        total_stock: totalStock
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error in daily-stock-snapshot function:', error)
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
