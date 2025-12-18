import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('🔧 Setting up Shopify webhook...')

    if (req.method !== 'POST') {
      return new Response('Method not allowed', { 
        status: 405, 
        headers: corsHeaders 
      })
    }

    // Obtener credenciales de Shopify
    const accessToken = Deno.env.get('SHOPIFY_ACCESS_TOKEN')
    const apiKey = Deno.env.get('SHOPIFY_API_KEY')
    
    if (!accessToken || !apiKey) {
      return new Response('Shopify credentials not configured', { 
        status: 500, 
        headers: corsHeaders 
      })
    }

    // URL del webhook (apunta a nuestra función shopify-webhook)
    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/shopify-webhook`
    
    // Configurar el webhook en Shopify
    const webhookData = {
      webhook: {
        topic: 'orders/paid',
        address: webhookUrl,
        format: 'json'
      }
    }

    const response = await fetch('https://pelodeoso.myshopify.com/admin/api/2024-01/webhooks.json', {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookData)
    })

    const result = await response.json()

    if (!response.ok) {
      console.error('❌ Failed to create webhook:', result)
      throw new Error(`Shopify API error: ${JSON.stringify(result)}`)
    }

    console.log('✅ Webhook created successfully:', result.webhook.id)

    return new Response(JSON.stringify({
      success: true,
      webhook_id: result.webhook.id,
      webhook_url: webhookUrl,
      topic: 'orders/paid'
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    })

  } catch (error) {
    console.error('💥 Error setting up webhook:', error)
    
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