import { corsHeaders } from '../_shared/cors.ts';

const BSALE_API_URL = 'https://api.bsale.io/v1';
const BSALE_ACCESS_TOKEN = Deno.env.get('BSALE_ACCESS_TOKEN');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Testing Bsale API connection...');
    
    if (!BSALE_ACCESS_TOKEN) {
      throw new Error('BSALE_ACCESS_TOKEN is not configured');
    }

    // Test connection by fetching offices
    const response = await fetch(`${BSALE_API_URL}/offices.json?limit=1`, {
      method: 'GET',
      headers: {
        'access_token': BSALE_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    console.log('Bsale API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Bsale API Error:', errorText);
      throw new Error(`Bsale API returned status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('Bsale API connection successful:', data);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Bsale API connection successful',
        status: response.status,
        tokenConfigured: true,
        apiUrl: BSALE_API_URL
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error testing Bsale connection:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        tokenConfigured: !!BSALE_ACCESS_TOKEN,
        apiUrl: BSALE_API_URL
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
