import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

function supabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
}

type Detail = {
  detailId: number;
  quantity: number;
}

type Input = {
  client: {
    code: string;
    email: string;
    company: string;
    activity: string;
    address: string;
    district: string;
    city: string;
  };
  shipping: {
    district: string;
    city: string;
    address: string;
    recipient: string;
  };
  details: Detail[];
  carrier: {
    nombre_empresa: string;
    ruc: string;
  };
  destinoUbigeo: string;
  emissionDateEpoch: number;
  startDateYmd: string;
  ventaId?: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405, 
      headers: corsHeaders 
    });
  }

  try {
    const input: Input = await req.json();
    console.log('Creating invoice remission guide with input:', JSON.stringify(input, null, 2));
    
    // Initialize Supabase client for auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('No authorization header found');
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseAdmin = supabaseClient();

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      console.log('Authentication failed:', authError);
      return new Response(
        JSON.stringify({ error: 'Authentication failed' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User authenticated:', user.id);

    // Check user permissions - same logic as create-remission-guide
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role, user_type_id')
      .eq('id', user.id)
      .single();

    // Check permissions using multiple methods for compatibility
    let hasPermission = false;

    // Method 1: Legacy role system
    if (profile && ['admin', 'vendedora'].includes(profile.role)) {
      hasPermission = true;
      console.log('Permission granted via legacy role:', profile.role);
    }

    // Method 2: New user type system - check if user has admin user type
    if (!hasPermission && profile?.user_type_id) {
      const { data: userType } = await supabaseAdmin
        .from('user_types')
        .select('is_admin')
        .eq('id', profile.user_type_id)
        .single();
      
      if (userType?.is_admin) {
        hasPermission = true;
        console.log('Permission granted via admin user type');
      }
    }

    // Method 3: Check specific permissions via tables (service role bypasses RLS)
    if (!hasPermission && profile?.user_type_id) {
      const { data: permRows, error: permErr } = await supabaseAdmin
        .from('user_type_permissions')
        .select('permissions(name)')
        .eq('user_type_id', profile.user_type_id);

      if (permErr) {
        console.log('Permission fetch error:', permErr);
      } else {
        const names = (permRows || []).map((r: any) => r.permissions?.name).filter(Boolean);
        if (names.includes('emit_documents') || names.includes('picking_operations') || names.includes('manage_sales')) {
          hasPermission = true;
          console.log('Permission granted via permissions table:', names);
        }
      }
    }

    // Fallback: database function (may return false when no JWT context)
    if (!hasPermission) {
      const { data: permissionCheck } = await supabaseAdmin
        .rpc('user_has_permission', { permission_name: 'emit_documents' });
      if (permissionCheck) {
        hasPermission = true;
      }
    }

    if (!hasPermission) {
      console.log('Permission denied for user:', user.id, 'profile:', profile);
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions - document emission access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Permission check passed for user:', user.id);

    // **PHASE 1: VALIDATE ASSIGNMENTS EXIST BEFORE EMITTING**
    console.log('🔍 [INVOICE-REMISSION-GUIDE] Step 1: Validating assignments exist...');
    if (input.ventaId) {
      const { data: assignments, error: assignError } = await supabaseAdmin
        .from('ventas_asignaciones')
        .select('id')
        .eq('venta_id', input.ventaId);
      
      if (assignError) {
        console.error('❌ Error checking assignments:', assignError);
        return new Response(
          JSON.stringify({ error: 'Error verificando asignaciones', details: assignError }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if assignments exist
      if (!assignments || assignments.length === 0) {
        console.error('❌ No assignments found for venta:', input.ventaId);
        return new Response(
          JSON.stringify({ 
            error: 'No se pueden emitir guías sin asignaciones. La venta no tiene stock asignado.',
            code: 'NO_ASSIGNMENTS'
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('✅ Assignments validated:', assignments.length, 'assignments found');
    }

    // Validation
    console.log('🔍 [INVOICE-REMISSION-GUIDE] Step 2: Validating input data...');
    if (!input.client?.code || !input.client?.company || !input.client?.activity) {
      return new Response(
        JSON.stringify({ error: 'Client information (code, company, activity) is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!input.shipping?.district || !input.shipping?.city || !input.shipping?.address || !input.shipping?.recipient) {
      return new Response(
        JSON.stringify({ error: 'Shipping information (district, city, address, recipient) is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!input.details || !Array.isArray(input.details) || input.details.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Details array is required and cannot be empty' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!input.carrier?.nombre_empresa || !input.carrier?.ruc) {
      return new Response(
        JSON.stringify({ error: 'Carrier information (nombre_empresa, ruc) is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!input.emissionDateEpoch || !input.startDateYmd || !input.destinoUbigeo) {
      return new Response(
        JSON.stringify({ error: 'emissionDateEpoch, startDateYmd, and destinoUbigeo are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Construct payload for Bsale API
    const payload = {
      documentTypeId: 123,
      officeId: 17,
      emissionDate: input.emissionDateEpoch,
      priceListId: 31,
      shippingTypeId: 10,
      district: input.shipping.district,
      city: input.shipping.city,
      address: input.shipping.address,
      declare: 1,
      recipient: input.shipping.recipient,
      details: input.details,
      client: {
        code: input.client.code,
        district: input.client.district,
        activity: input.client.activity,
        company: input.client.company,
        city: input.client.city,
        email: input.client.email,
        address: input.client.address
      },
      dynamicAttributes: [
        { alias: "shipmentTransportModeCode", values: ["01"] },
        { alias: "shipmentCarrierCompanyName", values: [input.carrier.nombre_empresa] },
        { alias: "shipmentCarrierCodeType", values: ["6"] },
        { alias: "shipmentCarrierCode", values: [input.carrier.ruc] },
        { alias: "shipmentStartDate", values: [input.startDateYmd] },
        { alias: "shipmentOriginAddressDescription", values: ["Prol. Lucanas 1043"] },
        { alias: "shipmentOriginAddressId", values: ["150115"] },
        { alias: "shipmentDeliveryAddressId", values: [input.destinoUbigeo] },
        { alias: "shipmentGrossWeightMeasure", values: ["1"] }
      ]
    };

    console.log('📦 [INVOICE-REMISSION-GUIDE] Step 3: Sending payload to Bsale...');
    console.log('Payload for Bsale:', JSON.stringify(payload, null, 2));

    // Make request to Bsale API
    const bsaleAccessToken = Deno.env.get('BSALE_ACCESS_TOKEN');
    if (!bsaleAccessToken) {
      throw new Error('BSALE_ACCESS_TOKEN environment variable is not set');
    }

    const bsaleResponse = await fetch('https://api.bsale.io/v1/shippings.json', {
      method: 'POST',
      headers: {
        'access_token': bsaleAccessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const bsaleData = await bsaleResponse.json();
    console.log('✅ [INVOICE-REMISSION-GUIDE] Bsale API response:', JSON.stringify(bsaleData, null, 2));
    
    // Extract guide info (may be nested under "guide")
    const guideUrl = bsaleData?.guide?.urlPublicView ?? bsaleData?.urlPublicView ?? null;
    const guideNumber = bsaleData?.guide?.number ?? bsaleData?.number ?? null;

    if (!bsaleResponse.ok) {
      console.error('Bsale API error:', bsaleData);
      return new Response(
        JSON.stringify({ 
          error: 'Error from Bsale API', 
          details: bsaleData 
        }),
        { 
          status: bsaleResponse.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('🔍 [INVOICE-REMISSION-GUIDE] Step 4: Finding sale record in database...');
    
    // Find sale record in Supabase (reuse admin client)
    let ventaRecord;
    if (input.ventaId) {
      // Find by ventaId directly
      const { data: ventaData, error: ventaError } = await supabaseAdmin
        .from('ventas')
        .select('*')
        .eq('id', input.ventaId)
        .single();
      
      if (ventaError) {
        console.error('Error finding venta by ID:', ventaError);
        return new Response(
          JSON.stringify({ error: 'Error finding sale record', details: ventaError }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      ventaRecord = ventaData;
    } else {
      // Find by RUC and latest created_at
      const { data: ventaData, error: ventaError } = await supabaseAdmin
        .from('ventas')
        .select('*')
        .eq('cliente_info->>ruc', input.client.code)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (ventaError) {
        console.error('Error finding venta by RUC:', ventaError);
        return new Response(
          JSON.stringify({ error: 'Error finding sale record', details: ventaError }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      ventaRecord = ventaData;
    }

    if (!ventaRecord) {
      console.error('❌ Sale record not found');
      return new Response(
        JSON.stringify({ error: 'Sale record not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ [INVOICE-REMISSION-GUIDE] Sale record found:', ventaRecord.venta_id);

    // **PHASE 2: CONSUME STOCK FROM RESERVED (BEFORE ARCHIVING)**
    console.log('📦 [INVOICE-REMISSION-GUIDE] Step 5: Consuming stock from reserved for venta:', ventaRecord.venta_id);
    try {
      // Use RPC to consume stock from reserved state
      const { data: consumeResult, error: consumeError } = await supabaseAdmin
        .rpc('consume_stock_from_reserved', { sale_id_param: ventaRecord.id });
      
      if (consumeError) {
        console.error('❌ [INVOICE-REMISSION-GUIDE] Stock consumption failed:', consumeError);
        throw new Error(`Error al consumir stock: ${consumeError.message}`);
      }
      
      console.log('✅ [INVOICE-REMISSION-GUIDE] Stock consumed successfully:', consumeResult);
    } catch (error) {
      console.error('❌ [INVOICE-REMISSION-GUIDE] Stock consumption error:', error);
      throw new Error(`Failed to consume stock: ${error instanceof Error ? error.message : String(error)}`);
    }

    // **PHASE 3: DELETE ASSIGNMENTS AFTER CONSUMPTION**
    console.log('🗑️ [INVOICE-REMISSION-GUIDE] Step 6: Deleting assignments after successful consumption...');
    const { error: deleteAssignmentsError } = await supabaseAdmin
      .from('ventas_asignaciones')
      .delete()
      .eq('venta_id', ventaRecord.id);
    
    if (deleteAssignmentsError) {
      console.error('⚠️ [INVOICE-REMISSION-GUIDE] Warning: Could not delete assignments:', deleteAssignmentsError);
      // Non-critical error, continue
    } else {
      console.log('✅ [INVOICE-REMISSION-GUIDE] Assignments deleted successfully');
    }

    // **PHASE 4: ARCHIVE SALE (FINAL STEP)**
    console.log('📝 [INVOICE-REMISSION-GUIDE] Step 7: Archiving sale...');
    const { data: updateData, error: updateError } = await supabaseAdmin
      .from('ventas')
      .update({
        guia_remision: true,
        estado: 'archivado',
        url_guia_remision: guideUrl,
        notas: ventaRecord.notas
          ? `${ventaRecord.notas}\nGuía de remisión generada. Número: ${guideNumber ?? 'N/A'}${guideUrl ? ` URL: ${guideUrl}` : ''}`
          : `Guía de remisión generada. Número: ${guideNumber ?? 'N/A'}${guideUrl ? ` URL: ${guideUrl}` : ''}`,
      })
      .eq('id', ventaRecord.id)
      .select();

    if (updateError) {
      console.error('❌ [INVOICE-REMISSION-GUIDE] Error updating venta:', updateError);
      return new Response(
        JSON.stringify({ error: 'Error updating sale record', details: updateError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ [INVOICE-REMISSION-GUIDE] Sale archived successfully:', updateData);

    // Write audit log entry for dashboard counters
    console.log('📝 [INVOICE-REMISSION-GUIDE] Step 8: Writing audit log...');
    const userName = (profile as any)?.full_name || user.email || 'Sistema';
    await supabaseAdmin
      .from('ventas_audit_log')
      .insert({
        venta_id: ventaRecord.id,
        venta_codigo: ventaRecord.venta_id,
        accion: 'documento_emitido',
        estado_anterior: ventaRecord.estado,
        estado_nuevo: 'archivado',
        usuario_id: user.id,
        usuario_nombre: userName,
        detalles: { guideUrl, guideNumber, shippingId: bsaleData?.id ?? null }
      });

    console.log('✅ [INVOICE-REMISSION-GUIDE] Process completed successfully');

    return new Response(
      JSON.stringify(bsaleData),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Error in create-invoice-remission-guide:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});