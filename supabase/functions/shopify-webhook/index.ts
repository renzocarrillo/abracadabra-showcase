import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.1'
import { corsHeaders } from '../_shared/cors.ts'

// Función para verificar el webhook de Shopify usando HMAC
function verifyShopifyWebhook(body: string, signature: string, secret: string): boolean {
  const hmac = signature.replace('sha256=', '')
  const encoder = new TextEncoder()
  const key = encoder.encode(secret)
  const data = encoder.encode(body)
  
  return crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  ).then(cryptoKey => 
    crypto.subtle.sign('HMAC', cryptoKey, data)
  ).then(signature => {
    const expectedSignature = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    return hmac === expectedSignature
  })
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('🛍️ Shopify webhook received:', req.method)

    // Verificar que sea un POST request
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { 
        status: 405, 
        headers: corsHeaders 
      })
    }

    // Obtener el body y headers
    const body = await req.text()
    const signature = req.headers.get('x-shopify-hmac-sha256')
    const topic = req.headers.get('x-shopify-topic')
    
    console.log('📋 Webhook topic:', topic)
    console.log('🔍 Request signature:', signature ? 'Present' : 'Missing')

    // Verificar que sea el evento que esperamos
    if (topic !== 'orders/paid') {
      console.log('⏭️ Ignoring webhook topic:', topic)
      return new Response('OK - Topic ignored', { 
        status: 200, 
        headers: corsHeaders 
      })
    }

    // Verificar la autenticidad del webhook
    const webhookSecret = Deno.env.get('SHOPIFY_WEBHOOK_SECRET')
    if (!webhookSecret) {
      console.error('❌ SHOPIFY_WEBHOOK_SECRET not configured')
      return new Response('Server configuration error', { 
        status: 500, 
        headers: corsHeaders 
      })
    }

    if (!signature) {
      console.error('❌ Missing webhook signature')
      return new Response('Missing signature', { 
        status: 401, 
        headers: corsHeaders 
      })
    }

    // Verificar la firma del webhook
    const isValidSignature = await verifyShopifyWebhook(body, signature, webhookSecret)
    if (!isValidSignature) {
      console.error('❌ Invalid webhook signature')
      return new Response('Invalid signature', { 
        status: 401, 
        headers: corsHeaders 
      })
    }

    console.log('✅ Webhook signature verified')

    // Parsear el payload del pedido
    const order = JSON.parse(body)
    console.log('📦 Processing order:', order.id, 'for', order.total_price, order.currency)

    // Inicializar cliente Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Generar ID único para la venta
    const { data: nextSalesNumber, error: salesNumberError } = await supabase
      .rpc('get_next_sales_number')

    if (salesNumberError) {
      console.error('❌ Error generating sales number:', salesNumberError)
      throw new Error('Failed to generate sales number')
    }

    const ventaId = nextSalesNumber as string
    console.log('🆔 Generated venta ID:', ventaId)

    // Preparar información del cliente
    const clienteInfo = {
      id: order.customer?.id || null,
      nombre: `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim() || 'Cliente Web',
      email: order.customer?.email || null,
      telefono: order.customer?.phone || null
    }

    // Preparar información de envío
    const envioInfo = {
      direccion: order.shipping_address ? {
        nombre: `${order.shipping_address.first_name || ''} ${order.shipping_address.last_name || ''}`.trim(),
        direccion1: order.shipping_address.address1 || '',
        direccion2: order.shipping_address.address2 || null,
        ciudad: order.shipping_address.city || '',
        provincia: order.shipping_address.province || '',
        codigo_postal: order.shipping_address.zip || '',
        pais: order.shipping_address.country || '',
        telefono: order.shipping_address.phone || null
      } : null,
      metodo_envio: order.shipping_lines?.[0]?.title || null,
      costo_envio: parseFloat(order.shipping_lines?.[0]?.price || '0')
    }

    // Calcular totales
    const subtotal = parseFloat(order.subtotal_price || '0')
    const impuestos = parseFloat(order.total_tax || '0')
    const total = parseFloat(order.total_price || '0')

    // Crear la venta principal
    const { data: ventaCreada, error: ventaError } = await supabase
      .from('ventas')
      .insert({
        venta_id: ventaId,
        estado: 'pendiente',
        cliente_info: clienteInfo,
        envio_info: envioInfo,
        subtotal: subtotal,
        igv: impuestos,
        total: total,
        metodo_pago: order.payment_gateway_names?.[0] || 'shopify',
        notas: `Pedido Shopify #${order.order_number} - ${order.name}`
      })
      .select()
      .single()

    if (ventaError) {
      console.error('❌ Error creating venta:', ventaError)
      throw new Error('Failed to create venta')
    }

    console.log('✅ Venta created:', ventaCreada.id)

    // Procesar los productos del pedido
    const ventaDetalles = []
    for (const lineItem of order.line_items) {
      const sku = lineItem.sku
      
      if (!sku) {
        console.warn('⚠️ Line item without SKU:', lineItem.title)
        continue
      }

      // Verificar que el producto existe en nuestra base de datos
      const { data: variant, error: variantError } = await supabase
        .from('variants')
        .select('nombreProducto, variante')
        .eq('sku', sku)
        .maybeSingle()

      if (variantError) {
        console.error('❌ Error checking variant:', variantError)
        continue
      }

      if (!variant) {
        console.warn('⚠️ SKU not found in database:', sku)
        continue
      }

      const precioUnitario = parseFloat(lineItem.price)
      const valorUnitario = precioUnitario / 1.18 // Asumiendo IGV 18%
      const cantidad = lineItem.quantity
      const subtotalLinea = precioUnitario * cantidad

      ventaDetalles.push({
        venta_id: ventaCreada.id,
        sku: sku,
        nombre_producto: variant.nombreProducto,
        variante: variant.variante,
        cantidad: cantidad,
        precio_unitario: precioUnitario,
        valor_unitario: valorUnitario,
        subtotal_linea: subtotalLinea
      })
    }

    if (ventaDetalles.length === 0) {
      console.error('❌ No valid products found in order')
      throw new Error('No valid products found in order')
    }

    // Insertar los detalles de la venta
    const { error: detalleError } = await supabase
      .from('ventas_detalle')
      .insert(ventaDetalles)

    if (detalleError) {
      console.error('❌ Error creating venta details:', detalleError)
      throw new Error('Failed to create venta details')
    }

    console.log('✅ Venta details created:', ventaDetalles.length, 'items')

    // Asignar stock automáticamente usando la función de base de datos
    const { data: assignResult, error: assignError } = await supabase
      .rpc('assign_bins_to_sale', { sale_id: ventaCreada.id })

    if (assignError) {
      console.error('❌ Error assigning stock:', assignError)
      // No fallar completamente, pero registrar el error
      console.log('⚠️ Sale created but stock assignment failed - manual assignment required')
    } else {
      console.log('✅ Stock assigned successfully:', assignResult)
    }

    // Respuesta exitosa
    const response = {
      success: true,
      venta_id: ventaId,
      shopify_order_id: order.id,
      shopify_order_number: order.order_number,
      total_items: ventaDetalles.length,
      total_amount: total,
      stock_assigned: !assignError
    }

    console.log('🎉 Shopify webhook processed successfully:', response)

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    })

  } catch (error) {
    console.error('💥 Error processing Shopify webhook:', error)
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    })
  }
})