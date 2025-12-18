import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface StockResetRequest {
  password: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log('🔵 [RESET] Request received from:', req.headers.get('origin'));

  try {
    // Verify authentication first
    const authHeader = req.headers.get('Authorization');
    console.log('🔵 [RESET] Auth header present:', !!authHeader);
    
    if (!authHeader) {
      console.error('❌ [RESET] No authorization header');
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's auth context
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Verify user and check if admin
    console.log('🔵 [RESET] Verifying user authentication...');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    
    if (authError) {
      console.error('❌ [RESET] Auth error:', authError.message);
      return new Response(
        JSON.stringify({ error: 'Invalid authentication', details: authError.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!user) {
      console.error('❌ [RESET] No user found');
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ [RESET] User authenticated:', user.id);

    // Check user permissions - must be admin (unified system)
    console.log('🔵 [RESET] Checking admin permissions...');
    
    // Use SERVICE_ROLE_KEY to bypass RLS for profile check
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select(`
        role,
        user_type_id,
        user_types (
          is_admin,
          name
        )
      `)
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('❌ [RESET] Profile fetch error:', profileError.message);
      return new Response(
        JSON.stringify({ error: 'Error fetching profile', details: profileError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!profile) {
      console.error('❌ [RESET] Profile not found for user:', user.id);
      return new Response(
        JSON.stringify({ error: 'User profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🔵 [RESET] Profile found - Role:', profile.role, 'User Type Admin:', profile.user_types?.is_admin);

    // Check admin status using unified permission system:
    // 1. Legacy role system (role = 'admin')
    // 2. New user type system (user_types.is_admin = true)
    const isAdmin = profile.role === 'admin' || profile.user_types?.is_admin === true;

    if (!isAdmin) {
      console.error('❌ [RESET] Access denied for user:', user.id, 'Role:', profile.role, 'Is Admin:', profile.user_types?.is_admin);
      return new Response(
        JSON.stringify({ 
          error: 'Access denied - Admin privileges required',
          details: `Role: ${profile.role}, Is Admin: ${profile.user_types?.is_admin}`
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ [RESET] Admin access granted for user:', user.id);

    const requestData: StockResetRequest = await req.json()
    console.log('✅ [RESET] Stock reset request received')

    // Validate password (additional security layer)
    if (!requestData.password) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Password is required'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Use service role for destructive operations
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log('Starting destructive stock reset process...')

    // Step 1: Cancel all pending orders (archive them)
    console.log('Step 1: Canceling pending orders...')
    
    // First get all pending orders for audit logging
    const { data: pendingOrders } = await supabase
      .from('pedidos')
      .select('id, pedido_id')
      .eq('estado', 'pendiente');

    const { error: cancelOrdersError } = await supabase
      .from('pedidos')
      .update({ 
        estado: 'archivado',
        motivo_eliminacion: 'Reset del sistema - Orden cancelada automáticamente',
        fecha_eliminacion: new Date().toISOString()
      })
      .eq('estado', 'pendiente')

    // Log audit trail for each cancelled order
    if (pendingOrders) {
      for (const order of pendingOrders) {
        await supabase.rpc('log_pedido_state_change', {
          p_pedido_id: order.id,
          p_pedido_codigo: order.pedido_id,
          p_accion: 'cancelado',
          p_estado_anterior: 'pendiente',
          p_estado_nuevo: 'archivado',
          p_usuario_id: null,
          p_usuario_nombre: 'Sistema - Reset Automático',
          p_detalles: JSON.stringify({
            tipo_operacion: 'reset_sistema',
            motivo: 'Reset del sistema - Orden cancelada automáticamente'
          })
        });
      }
    }

    if (cancelOrdersError) {
      console.error('Error canceling orders:', cancelOrdersError)
      throw new Error('Failed to cancel pending orders')
    }

    // Also cancel pending sales
    const { error: cancelSalesError } = await supabase
      .from('ventas')
      .update({ 
        estado: 'archivado',
        motivo_eliminacion: 'Reset del sistema - Venta cancelada automáticamente',
        fecha_eliminacion: new Date().toISOString()
      })
      .eq('estado', 'pendiente')

    if (cancelSalesError) {
      console.error('Error canceling sales:', cancelSalesError)
      throw new Error('Failed to cancel pending sales')
    }

    // Step 2: Clear all stock assignments FIRST (to avoid foreign key constraints)
    console.log('Step 2: Clearing all stock assignments...')
    
    const { error: clearOrderAssignmentsError } = await supabase
      .from('pedidos_asignaciones')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')

    if (clearOrderAssignmentsError) {
      console.error('Error clearing order assignments:', clearOrderAssignmentsError)
      throw new Error('Failed to clear order assignments')
    }

    const { error: clearSalesAssignmentsError } = await supabase
      .from('ventas_asignaciones')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')

    if (clearSalesAssignmentsError) {
      console.error('Error clearing sales assignments:', clearSalesAssignmentsError)
      throw new Error('Failed to clear sales assignments')
    }

    // Step 2.5: Clear inventory changes first (references stockxbin)
    console.log('Step 2.5: Clearing inventory changes...')
    const { error: clearInventoryChangesError } = await supabase
      .from('inventory_changes')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')

    if (clearInventoryChangesError) {
      console.error('Error clearing inventory changes:', clearInventoryChangesError)
      throw new Error('Failed to clear inventory changes')
    }

    // Step 2.6: Clear stock totals (references stockxbin via sku)
    console.log('Step 2.6: Clearing stock totals...')
    const { error: clearStockTotalsError } = await supabase
      .from('stock_totals')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')

    if (clearStockTotalsError) {
      console.error('Error clearing stock totals:', clearStockTotalsError)
      throw new Error('Failed to clear stock totals')
    }
    // Step 2.65: Detach stock references from picking libre items (preserve history)
    console.log('Step 2.65: Detaching stock references from picking libre items...')
    const { error: detachPickingLibreError } = await supabase
      .from('picking_libre_items')
      .update({ stock_id: null })
      .not('stock_id', 'is', null)

    if (detachPickingLibreError) {
      console.error('Error detaching picking libre stock references:', detachPickingLibreError)
      throw new Error('Failed to detach picking libre stock references')
    }

    // Step 2.7: Clear ONLY active Picking Libre sessions (preserve completed ones for signature)
    console.log('Step 2.7: Clearing active picking libre sessions (preserving completed)...')
    
    // Get IDs of active sessions only (status = 'iniciado')
    const { data: activeSessions } = await supabase
      .from('picking_libre_sessions')
      .select('id')
      .eq('status', 'iniciado');
    
    if (activeSessions && activeSessions.length > 0) {
      const activeSessionIds = activeSessions.map(s => s.id);
      
      // Delete items only from active sessions
      const { error: clearPickingLibreItemsError } = await supabase
        .from('picking_libre_items')
        .delete()
        .in('session_id', activeSessionIds);

      if (clearPickingLibreItemsError) {
        console.error('Error clearing picking libre items:', clearPickingLibreItemsError)
        throw new Error('Failed to clear picking libre items')
      }

      // Delete only active sessions
      const { error: clearPickingLibreSessionsError } = await supabase
        .from('picking_libre_sessions')
        .delete()
        .eq('status', 'iniciado');

      if (clearPickingLibreSessionsError) {
        console.error('Error clearing picking libre sessions:', clearPickingLibreSessionsError)
        throw new Error('Failed to clear picking libre sessions')
      }
      
      console.log(`Cleared ${activeSessions.length} active picking sessions (preserved completed ones)`)
    } else {
      console.log('No active picking sessions to clear')
    }

    // Step 3: Now delete all existing stock from stockxbin (all references are cleared)
    console.log('Step 3: Clearing all existing stock...')
    const { error: clearStockError } = await supabase
      .from('stockxbin')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all records

    if (clearStockError) {
      console.error('Error clearing stock:', clearStockError)
      throw new Error('Failed to clear existing stock')
    }

    // Step 4: Get stock from stock_tiendas_bsale (almCentral column) using pagination
    console.log('Step 4: Fetching stock from base system using pagination...')
    
    // First, get the total count of records to process
    const { count: totalCount, error: countError } = await supabase
      .from('stocks_tiendas_bsale')
      .select('*', { count: 'exact', head: true })
      .gt('almCentral', 0)
    
    if (countError) {
      console.error('Error counting base stock:', countError)
      throw new Error('Failed to count base stock data')
    }
    
    console.log(`Found ${totalCount} records with stock > 0 in base system`)
    
    if (!totalCount || totalCount === 0) {
      console.log('No stock found in base system')
      return new Response(
        JSON.stringify({
          success: true,
          message: 'System reset completed - no stock to restore',
          ordersArchived: true,
          stockCleared: true,
          stockRestored: 0
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }
    
    // Ensure Transito bin exists before inserting restored stock
    console.log('Step 4.1: Ensuring Transito bin exists...')
    const { error: binErrorEarly } = await supabase
      .from('bins')
      .upsert(
        { bin_code: 'Transito' },
        { onConflict: 'bin_code', ignoreDuplicates: true }
      )

    if (binErrorEarly) {
      console.error('Error ensuring Transito bin exists (early):', binErrorEarly)
      throw new Error('Failed to ensure Transito bin exists before restore')
    }

    // Process in batches of 1000
    const batchSize = 1000
    const totalBatches = Math.ceil(totalCount / batchSize)
    let totalProcessed = 0
    
    console.log(`Processing ${totalCount} records in ${totalBatches} batches of ${batchSize}`)
    
    for (let batch = 0; batch < totalBatches; batch++) {
      const offset = batch * batchSize
      console.log(`Processing batch ${batch + 1}/${totalBatches} (offset: ${offset})`)
      
      const { data: batchStock, error: fetchBatchError } = await supabase
        .from('stocks_tiendas_bsale')
        .select('sku, idVariant, almCentral')
        .gt('almCentral', 0)
        .range(offset, offset + batchSize - 1)
      
      if (fetchBatchError) {
        console.error(`Error fetching batch ${batch + 1}:`, fetchBatchError)
        throw new Error(`Failed to fetch batch ${batch + 1} of stock data`)
      }
      
      if (batchStock && batchStock.length > 0) {
        const stockRecords = batchStock.map(item => ({
          sku: item.sku,
          idBsale: item.idVariant,
          bin: 'Transito',
          disponibles: item.almCentral,
          comprometido: 0,
          en_existencia: item.almCentral
        }))
        
        const { error: insertBatchError } = await supabase
          .from('stockxbin')
          .insert(stockRecords)
        
        if (insertBatchError) {
          console.error(`Error inserting batch ${batch + 1}:`, insertBatchError)
          throw new Error(`Failed to insert batch ${batch + 1} of stock records`)
        }
        
        totalProcessed += stockRecords.length
        console.log(`Batch ${batch + 1} completed: ${stockRecords.length} records inserted. Total processed: ${totalProcessed}/${totalCount}`)
      }
    }
    
    // Step 5: Transito bin was ensured earlier (Step 4.1)

    console.log(`Stock reset completed successfully. Restored ${totalProcessed} items to Transito bin`)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Sistema reseteado exitosamente',
        ordersArchived: true,
        stockCleared: true,
        stockRestored: totalProcessed,
        details: {
          restoredItems: totalProcessed,
          targetBin: 'Transito',
          totalBatches: totalBatches,
          batchSize: batchSize
        }
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Error in stock reset:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Error interno del servidor',
        details: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})