import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper function to fetch document details with pagination
async function fetchDocumentDetails(documentId: number, accessToken: string) {
  const allDetails: any[] = []
  let offset = 0
  const limit = 50
  let hasMore = true

  while (hasMore) {
    console.log(`Fetching document details with offset: ${offset}, limit: ${limit}`)
    
    const url = new URL(`https://api.bsale.io/v1/documents/${documentId}/details.json`)
    url.searchParams.set('limit', limit.toString())
    url.searchParams.set('offset', offset.toString())

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'access_token': accessToken,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch document details: ${response.status} ${response.statusText}`)
    }

    const result = await response.json()
    console.log(`Fetched ${result.items?.length || 0} details, count: ${result.count}`)

    if (result.items && result.items.length > 0) {
      allDetails.push(...result.items)
    }

    // Check if we need to continue pagination
    hasMore = result.count > (offset + limit)
    offset += limit
  }

  console.log(`Total document details fetched: ${allDetails.length}`)
  console.log(`Document details:`, JSON.stringify(allDetails, null, 2))
  return allDetails
}

// Helper function to update ventas_detalle with detailId
async function updateVentaDetalleWithBsaleIds(supabase: any, saleId: string, documentDetails: any[]) {
  try {
    // Get current ventas_detalle records
    const { data: ventaDetails, error: fetchError } = await supabase
      .from('ventas_detalle')
      .select('id, sku')
      .eq('venta_id', saleId)
    
    if (fetchError) {
      throw new Error(`Error fetching venta details: ${fetchError.message}`)
    }

    console.log(`Found ${ventaDetails?.length || 0} venta details to update`)
    console.log(`Found ${documentDetails.length} document details from Bsale`)
    console.log('Venta details SKUs:', ventaDetails?.map(v => v.sku))
    console.log('Bsale detail variant codes:', documentDetails.map(d => d?.variant?.code))

    // Match and update each venta_detalle record
    for (const ventaDetalle of ventaDetails || []) {
      // Find matching document detail by SKU (code in Bsale)
      const matchingDetail = documentDetails.find(detail => (detail?.variant?.code) === ventaDetalle.sku)
      
      if (matchingDetail && matchingDetail.id) {
        console.log(`Updating venta_detalle ${ventaDetalle.id} (SKU: ${ventaDetalle.sku}) with detail_id_bsale: ${matchingDetail.id}`)
        
        const { error: updateError } = await supabase
          .from('ventas_detalle')
          .update({ detail_id_bsale: matchingDetail.id })
          .eq('id', ventaDetalle.id)
        
        if (updateError) {
          console.error(`Error updating venta_detalle ${ventaDetalle.id}:`, updateError)
          throw updateError
        } else {
          console.log(`Successfully updated venta_detalle ${ventaDetalle.id} with detail_id_bsale: ${matchingDetail.id}`)
        }
      } else {
        console.warn(`No matching document detail found for SKU: ${ventaDetalle.sku}`)
      }
    }
  } catch (error) {
    console.error('Error updating ventas_detalle with Bsale IDs:', error)
    throw error
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { saleId, documentId } = await req.json()

    console.log(`Updating detail IDs for sale: ${saleId}, Bsale document ID: ${documentId}`)

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get Bsale access token
    const bsaleAccessToken = Deno.env.get('BSALE_ACCESS_TOKEN');
    if (!bsaleAccessToken) {
      throw new Error('BSALE_ACCESS_TOKEN not configured')
    }

    // Fetch document details from Bsale
    const documentDetails = await fetchDocumentDetails(documentId, bsaleAccessToken)
    
    if (documentDetails.length === 0) {
      throw new Error('No document details found from Bsale API')
    }

    // Update ventas_detalle with Bsale detail IDs
    await updateVentaDetalleWithBsaleIds(supabase, saleId, documentDetails)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully updated ${documentDetails.length} detail records`,
        updated_count: documentDetails.length
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error updating detail IDs:', error)
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