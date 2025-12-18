import { createSupabaseClient } from './supabase-client.ts'

// Helper function to get sales assignments
export async function getVentaAssignments(supabase: any, saleId: string) {
  const { data: assignments, error } = await supabase
    .from('ventas_asignaciones')
    .select('*')
    .eq('venta_id', saleId)
  
  if (error) {
    console.error('Error fetching assignments:', error)
    return []
  }
  
  return assignments || []
}

// Helper function to fetch document details from Bsale with pagination
export async function fetchDocumentDetails(documentId: number, accessToken: string) {
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
  return allDetails
}

// Helper function to update ventas_detalle with Bsale IDs
export async function updateVentaDetalleWithBsaleIds(supabase: any, saleId: string, documentDetails: any[]) {
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

    // Match and update each venta_detalle record
    for (const ventaDetalle of ventaDetails || []) {
      // Find matching document detail by SKU (code in Bsale)
      const matchingDetail = documentDetails.find(detail => (detail?.variant?.code) === ventaDetalle.sku)
      
      if (matchingDetail && matchingDetail.id) {
        console.log(`Updating venta_detalle ${ventaDetalle.id} with detail_id_bsale: ${matchingDetail.id}`)
        
        const { error: updateError } = await supabase
          .from('ventas_detalle')
          .update({ detail_id_bsale: matchingDetail.id })
          .eq('id', ventaDetalle.id)
        
        if (updateError) {
          console.error(`Error updating venta_detalle ${ventaDetalle.id}:`, updateError)
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

// Helper function to get payment type ID
export async function getPaymentTypeId(supabase: any, metodoPago: string) {
  const { data: paymentType, error: paymentError } = await supabase
    .from('payment_types')
    .select('id')
    .ilike('name', metodoPago)
    .single()

  if (paymentError || !paymentType) {
    throw new Error(`Tipo de pago no encontrado: ${metodoPago}`)
  }

  return paymentType.id
}

// Helper function to calculate emission date (Lima timezone)
export function calculateEmissionDate() {
  const today = new Date()
  const limaTime = new Date(today.toLocaleString("en-US", {timeZone: "America/Lima"}))
  const emissionDate = Math.floor(Date.UTC(limaTime.getFullYear(), limaTime.getMonth(), limaTime.getDate()) / 1000)
  
  console.log(`Emission date (Lima): ${limaTime.toDateString()} -> Epoch: ${emissionDate}`)
  return emissionDate
}

// Helper function to build document details for Bsale
export function buildDocumentDetails(ventaDetails: any[], variants: any[]) {
  return ventaDetails.map(item => {
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
}

// Helper function to validate required sale data
export function validateSaleData(venta: any, ventaDetails: any[]) {
  if (!venta) {
    throw new Error('Venta not found')
  }

  if (!venta.seller_id) {
    throw new Error('La venta debe tener un vendedor asignado para poder emitir el documento')
  }

  if (!ventaDetails || ventaDetails.length === 0) {
    throw new Error('No se encontraron detalles de la venta')
  }
}

// Helper function to get variants data
export async function getVariantsData(supabase: any, skus: string[]) {
  const { data: variants, error: variantError } = await supabase
    .from('variants')
    .select('sku, variant_value_12')
    .in('sku', skus)

  if (variantError) {
    throw new Error(`Error fetching variants: ${variantError.message}`)
  }

  return variants || []
}