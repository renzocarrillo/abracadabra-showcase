import { createSupabaseClient } from '../_shared/supabase-client.ts';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();
    const { sessionId } = await req.json();
    
    console.log('Attempting to recover failed free picking session:', sessionId);

    // 1. Get session information
    const { data: session, error: sessionError } = await supabase
      .from('picking_libre_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      throw new Error('Session not found');
    }

    // 2. Validate that it needs recovery
    if (session.url_public_view && session.bsale_response) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Esta sesión ya tiene documento emitido correctamente'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Validate it was completed but failed
    if (session.status !== 'completado') {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Esta sesión no está en estado completado, no necesita recuperación'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Session requires recovery, changing status back to en_proceso');

    // 4. Change status back to 'en_proceso' temporarily
    await supabase
      .from('picking_libre_sessions')
      .update({ status: 'en_proceso' })
      .eq('id', sessionId);

    // 5. Get session items
    const { data: items } = await supabase
      .from('picking_libre_items')
      .select('sku, quantity, bin_code')
      .eq('session_id', sessionId);

    const selectedItems = items?.map(item => ({
      sku: item.sku,
      quantity: item.quantity,
      bin: item.bin_code
    })) || [];

    console.log(`Retrying document emission for ${selectedItems.length} items`);

    // 6. Re-attempt document emission based on document type
    let result;
    
    if (session.documento_tipo === 'guia_remision') {
      console.log('Re-invoking create-free-picking-remission-guide');
      result = await supabase.functions.invoke('create-free-picking-remission-guide', {
        body: {
          sessionId: session.id,
          storeId: session.tienda_destino_id,
          selectedItems,
          transportistId: session.transportista_id
        }
      });
    } else {
      console.log('Re-invoking create-free-picking-transfer');
      result = await supabase.functions.invoke('create-free-picking-transfer', {
        body: {
          sessionId: session.id,
          storeId: session.tienda_destino_id,
          selectedItems
        }
      });
    }

    if (result.error) {
      console.error('Recovery failed, reverting status:', result.error);
      // Revert status if recovery fails
      await supabase
        .from('picking_libre_sessions')
        .update({ status: 'completado' })
        .eq('id', sessionId);
      
      throw new Error(result.error.message || 'Failed to recover document');
    }

    console.log('Document recovered successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Documento recuperado exitosamente',
        data: result.data
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in recover-failed-free-picking:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
