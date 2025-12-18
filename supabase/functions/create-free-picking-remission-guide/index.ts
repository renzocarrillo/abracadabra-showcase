import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

const BSALE_API_URL = 'https://api.bsale.io/v1';
const BSALE_ACCESS_TOKEN = Deno.env.get('BSALE_ACCESS_TOKEN');

// ============================================================================
// HELPER FUNCTIONS FOR HTML GENERATION
// ============================================================================

function getOrderTypeLabel(orderType: string): string {
  switch (orderType) {
    case 'pedido':
      return 'PEDIDO';
    case 'venta':
      return 'VENTA';
    case 'picking_libre':
      return 'PICKING LIBRE';
    default:
      return 'ORDEN';
  }
}

function formatDateTime(isoString: string): { date: string; time: string } {
  const date = new Date(isoString);
  return {
    date: date.toLocaleDateString('es-PE', {
      timeZone: 'America/Lima',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }),
    time: date.toLocaleTimeString('es-PE', {
      timeZone: 'America/Lima',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  };
}

function generateSignatureTicketHTML(data: any): string {
  const { date, time } = formatDateTime(data.signedAt);
  const orderTypeLabel = getOrderTypeLabel(data.orderType);
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=80mm">
  <title>Firma Digital - ${data.orderCode}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 5mm;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      font-weight: 700;
      line-height: 1.4;
      width: 80mm;
      padding: 5mm;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    
    @media print {
      body {
        margin: 0;
        padding: 5mm;
        color: #000 !important;
      }
    }
    
    .ticket {
      width: 100%;
    }
    
    .header {
      text-align: center;
      border-bottom: 3px solid #000;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    
    .header h1 {
      font-size: 13pt;
      font-weight: 900;
      margin-bottom: 2px;
      color: #000;
    }
    
    .header h2 {
      font-size: 11pt;
      font-weight: 800;
      color: #000;
    }
    
    .section {
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 2px dashed #000;
    }
    
    .section:last-of-type {
      border-bottom: none;
    }
    
    .label {
      font-size: 10pt;
      color: #000;
      font-weight: 700;
      margin-bottom: 2px;
    }
    
    .value {
      font-size: 12pt;
      font-weight: 900;
      margin-bottom: 6px;
      word-wrap: break-word;
      color: #000;
    }
    
    .footer {
      text-align: center;
      margin-top: 10px;
      padding-top: 8px;
      border-top: 3px solid #000;
      font-size: 10pt;
      font-weight: 800;
      color: #000;
    }
    
    .hash {
      font-size: 9pt;
      font-weight: 700;
      word-break: break-all;
      margin-top: 4px;
      color: #000;
    }
    
    .divider {
      text-align: center;
      margin: 8px 0;
      font-size: 11pt;
      font-weight: 900;
      color: #000;
    }
  </style>
</head>
<body>
  <div class="ticket">
    <div class="header">
      <h1>═══════════════════════════════════</h1>
      <h2>FIRMA DIGITAL DE PREPARACIÓN</h2>
      <h1>═══════════════════════════════════</h1>
    </div>
    
    <div class="section">
      <div class="label">Tipo:</div>
      <div class="value">${orderTypeLabel}</div>
      
      <div class="label">Código:</div>
      <div class="value">${data.orderCode}</div>
    </div>
    
    <div class="section">
      <div class="label">Destino/Cliente:</div>
      <div class="value">${data.destination}</div>
    </div>
    
    <div class="divider">-----------------------------------</div>
    
    <div class="section">
      
      ${data.productosRetiradosPor ? `
      <div class="divider" style="margin: 6px 0;">- - - - - - - - - - - - - - - - - - - - - -</div>
      
      <div class="label">Productos retirados por:</div>
      <div class="value">${data.productosRetiradosPor}</div>
      ` : ''}
      
      ${data.verifiedBy ? `
      <div class="divider" style="margin: 6px 0;">- - - - - - - - - - - - - - - - - - - - - -</div>
      
      <div class="label">Verificado por:</div>
      <div class="value">${data.verifiedBy}</div>
      ` : ''}
      
      <div class="divider" style="margin: 6px 0;">- - - - - - - - - - - - - - - - - - - - - -</div>
      
      <div class="label">Fecha:</div>
      <div class="value">${date}</div>
      
      <div class="label">Hora:</div>
      <div class="value">${time}</div>
    </div>
    
    ${data.documentType ? `
    <div class="divider">-----------------------------------</div>
    
    <div class="section">
      <div class="label">Tipo de documento:</div>
      <div class="value">${data.documentType}</div>
    </div>
    ` : ''}
    
    ${data.bsaleDocumentNumber ? `
    <div class="divider">-----------------------------------</div>
    
    <div class="section">
      <div class="label">Identificador Bsale:</div>
      <div class="value">${data.bsaleDocumentNumber}</div>
    </div>
    ` : ''}
    
    <div class="footer">
      <div>═══════════════════════════════════</div>
      <div style="margin: 5px 0; font-weight: bold;">Sistema Abracadabra</div>
      <div>Innovación Textil</div>
      <div>═══════════════════════════════════</div>
    </div>
  </div>
</body>
</html>
  `;
}

function generateTransferLabelHTML(data: any): string {
  const tipoMovimientoTexto = data.movementType 
    ? {
        'VENTA DIRECTA': 'VENTA DIRECTA',
        'REPOSICIÓN': 'REPOSICIÓN',
        'TRASLADO': 'TRASLADO'
      }[data.movementType] || 'TRANSFERENCIA'
    : 'TRANSFERENCIA';

  const barcodeUrl = `https://barcode.tec-it.com/barcode.ashx?data=${encodeURIComponent(data.code)}&code=Code128&translate-esc=on`;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Etiqueta de Transferencia ${data.code}</title>
  <style>
    @page {
      size: 100mm 100mm;
      margin: 0;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    html, body {
      width: 100mm;
      height: 100mm;
      overflow: hidden;
    }
    
    body {
      font-family: Arial, Helvetica, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      background: white;
      padding: 2mm;
    }
    
    .label-container {
      width: 100%;
      height: 100%;
      border: 2px solid #000;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    
    .section {
      padding: 2mm 2.5mm;
      border-bottom: 1px solid #000;
    }
    
    .section:last-child {
      border-bottom: none;
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    
    .title {
      font-size: 20px;
      font-weight: bold;
      text-align: center;
      letter-spacing: 0.5px;
      padding: 1.5mm 0;
    }
    
    .info {
      font-size: 10px;
      line-height: 1.4;
    }
    
    .info-line {
      margin-bottom: 0.6mm;
      display: flex;
      gap: 2mm;
    }
    
    .label {
      font-weight: normal;
      font-size: 9px;
    }
    
    .value {
      font-weight: bold;
      font-size: 10px;
    }
    
    .destination-value {
      font-weight: bold;
      font-size: 18px;
      margin-top: 1mm;
    }
    
    .barcode-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0;
      padding: 1mm 0;
    }
    
    .barcode-img {
      height: 20mm;
      max-width: 90mm;
      object-fit: contain;
    }
    
    @media print {
      body {
        padding: 2mm;
      }
    }
  </style>
</head>
<body>
  <div class="label-container">
    <div class="section">
      <div class="title">${tipoMovimientoTexto}</div>
    </div>
    
    <div class="section">
      <div class="info">
        <div class="info-line">
          <span class="label">Fecha y Hora:</span>
          <span class="value">${data.date} ${data.time || ''}</span>
        </div>
        <div class="info-line">
          <span class="label">Emitido por:</span>
          <span class="value">${data.createdBy || 'Sistema'}</span>
        </div>
        ${data.productosRetiradosPor ? `
        <div class="info-line">
          <span class="label">Productos retirados por:</span>
          <span class="value">${data.productosRetiradosPor}</span>
        </div>
        ` : ''}
        ${data.bsaleDocumentNumber ? `
        <div class="info-line">
          <span class="label">Identificador Bsale:</span>
          <span class="value">${data.bsaleDocumentNumber}</span>
        </div>
        ` : ''}
        <div class="info-line">
          <span class="label">Origen:</span>
          <span class="value">Almacén Central</span>
        </div>
      </div>
    </div>
    
    <div class="section">
      <div class="info">
        <div class="info-line">
          <span class="label">Destino:</span>
        </div>
        <div class="destination-value">${data.destination || 'Sin destino'}</div>
        ${data.itemsCount ? `
        <div class="info-line" style="margin-top: 2mm;">
          <span class="label">Total unidades:</span>
          <span class="value">${data.itemsCount}</span>
        </div>
        ` : ''}
      </div>
    </div>
    
    <div class="section">
      <div class="barcode-section">
        <img src="${barcodeUrl}" alt="Código de barras" class="barcode-img" />
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Initialize Supabase client and parse body OUTSIDE try block to avoid double-read issues
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  let sessionId: string;
  let emissionRecordId: string | null = null;
  
  try {
    const body = await req.json();
    sessionId = body.sessionId;
    const storeId = body.storeId;
    const selectedItems = body.selectedItems;
    const transportistId = body.transportistId;
    const expectedVersion = body.expectedVersion;

    console.log('');
    console.log('🟢 ========================================================================');
    console.log('🟢 INICIO: EMISIÓN DE GUÍA REMISIÓN PICKING LIBRE (Sistema 2 Estados)');
    console.log('🟢 ========================================================================');
    console.log('📊 Información de la sesión:');
    console.log('   - Session ID:', sessionId);
    console.log('   - Store ID:', storeId);
    console.log('   - Transportist ID:', transportistId);
    console.log('   - Items seleccionados:', selectedItems?.length);
    console.log('   - Versión esperada:', expectedVersion);
    console.log('');
    console.log('🎯 Flujo del sistema (2 estados):');
    console.log('   1️⃣ Validar sesión y tienda (solo Innovación)');
    console.log('   2️⃣ Construir payload para Bsale');
    console.log('   3️⃣ Emitir guía de remisión en Bsale');
    console.log('   4️⃣ Guardar traslado en DB local');
    console.log('   5️⃣ CONSUMIR STOCK: reservado → 0');
    console.log('   6️⃣ Trigger recalcula: en_existencia = disponibles + reservado');
    console.log('');
    console.log('📌 IMPORTANTE: El stock está actualmente RESERVADO');
    console.log('   - Estado actual: disponibles (ya reducido), reservado (con cantidad)');
    console.log('   - Después del consumo: reservado → 0');
    console.log('🟢 ========================================================================');
    console.log('');

    // Generate idempotency key
    const idempotencyKey = `guide_${sessionId}_${Date.now()}`;

    // Register emission attempt
    const { data: emissionRecord, error: emissionInsertError } = await supabase
      .from('picking_libre_emissions')
      .insert({
        session_id: sessionId,
        idempotency_key: idempotencyKey,
        emission_type: 'remission_guide',
        status: 'pending',
        request_payload: {
          sessionId,
          storeId,
          selectedItems,
          transportistId,
          expectedVersion
        }
      })
      .select()
      .single();

    if (emissionInsertError) {
      console.error('Failed to create emission record:', emissionInsertError);
      throw new Error('Failed to register emission attempt');
    }

    emissionRecordId = emissionRecord.id;
    console.log('Emission record created:', emissionRecordId);

    // Get store information
    const { data: storeInfo, error: storeError } = await supabase
      .from('tiendas')
      .select('*')
      .eq('id', storeId)
      .single();

    if (storeError || !storeInfo) {
      throw new Error('Store not found');
    }

    // CRITICAL VALIDATION: Remission guides only for Innovación stores
    if (storeInfo.pertenenceinnovacion !== true) {
      throw new Error('Las guías de remisión solo aplican para tiendas de Innovación');
    }

    // Get transportist information
    const { data: transportistInfo, error: transportError } = await supabase
      .from('transportistas')
      .select('*')
      .eq('id', transportistId)
      .single();

    if (transportError || !transportistInfo) {
      throw new Error('Transportist not found');
    }

    // Get next transfer number
    const { data: nextDocNumber } = await supabase.rpc('get_next_transfer_number');
    
    // Calculate emission date based on Lima timezone (America/Lima)
    const limaDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    
    const shipmentStartDate = limaDateStr; // e.g., 2024-10-24
    
    // Epoch at 00:00:00 local Lima time
    const emissionDate = Math.floor(new Date(`${shipmentStartDate}T00:00:00-05:00`).getTime() / 1000);

    // Consolidate selectedItems by SKU
    const consolidatedMap = new Map<string, { sku: string; quantity: number }>();
    for (const item of selectedItems) {
      const existing = consolidatedMap.get(item.sku);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        consolidatedMap.set(item.sku, { sku: item.sku, quantity: item.quantity });
      }
    }
    const consolidatedItems = Array.from(consolidatedMap.values());

    // Fetch variant data for consolidated items with product names
    const skus = consolidatedItems.map(item => item.sku);
    const { data: variants } = await supabase
      .from('variants')
      .select('sku, variant_value_12, nombreProducto')
      .in('sku', skus);

    // Build details using 1 as default for zero/negative values
    const details = consolidatedItems.map(item => {
      const variant = variants?.find(v => v.sku === item.sku);
      const netValue = Number(variant?.variant_value_12 || 0);
      
      // Use 1 as default if cost is 0 or negative
      const finalNetValue = netValue > 0 ? netValue : 1;
      
      if (netValue <= 0) {
        console.warn(`Product ${item.sku} (${variant?.nombreProducto}) has invalid cost ${netValue}, using 1 as default`);
      }
      
      return {
        quantity: item.quantity,
        code: item.sku,
        netUnitValue: finalNetValue
      };
    });


    // Build payload for remission guide
    const bsalePayload = {
      documentTypeId: 123, // Remission guide
      officeId: 17,
      emissionDate,
      shippingTypeId: 13,
      destinationOfficeId: Number(storeInfo.officeid),
      district: storeInfo.district,
      city: storeInfo.city,
      address: storeInfo.address,
      declare: 1,
      recipient: storeInfo.recipient,
      details: details,
      client: {
        code: String(storeInfo.recipient_ruc),
        district: storeInfo.district,
        company: storeInfo.recipient,
        city: storeInfo.city,
        address: storeInfo.address
      },
      dynamicAttributes: [
        { alias: "shipmentTransportModeCode", values: ["01"] },
        { alias: "shipmentCarrierCompanyName", values: [transportistInfo.nombre_empresa || 'N/A'] },
        { alias: "shipmentCarrierCodeType", values: ["6"] },
        { alias: "shipmentCarrierCode", values: [String(transportistInfo.ruc || '')] },
        { alias: "shipmentStartDate", values: [limaDateStr] },
        { alias: "shipmentOriginAddressDescription", values: ["Prol. Lucanas 1043"] },
        { alias: "shipmentOriginAddressId", values: ["150115"] },
        { alias: "shipmentDeliveryAddressId", values: [storeInfo.ubigeo_tiendas?.toString() || ""] },
        { alias: "deliveryAddressCode", values: [storeInfo.code_bsale_sunat || ""] },
        { alias: "despatchAddressCode", values: ["0046"] },
        { alias: "shipmentGrossWeightMeasure", values: ["1"] }
      ]
    };

    console.log('Sending remission guide to Bsale:', JSON.stringify(bsalePayload, null, 2));

    // Send to Bsale
    const bsaleResponse = await fetch(`${BSALE_API_URL}/shippings.json`, {
      method: 'POST',
      headers: {
        'access_token': BSALE_ACCESS_TOKEN!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bsalePayload)
    });

    if (!bsaleResponse.ok) {
      const errorText = await bsaleResponse.text();
      console.error('Bsale API Error:', errorText);
      throw new Error(`Error en Bsale: ${errorText}`);
    }

    const bsaleData = await bsaleResponse.json();
    console.log('Bsale response:', bsaleData);

    // Save transfer record
    const { data: transferData, error: transferError } = await supabase
      .from('traslados_internos')
      .insert({
        document_number: nextDocNumber,
        emission_date: emissionDate,
        office_id: 17,
        destination_office_id: String(storeInfo.officeid),
        recipient: storeInfo.recipient,
        address: storeInfo.address,
        city: storeInfo.city,
        district: storeInfo.district,
        total_items: consolidatedItems.reduce((sum, item) => sum + item.quantity, 0), // Total units
        tienda_id: storeInfo.id,
        url_public_view: bsaleData?.guide?.urlPublicView || bsaleData?.urlPublicView,
        bsale_response: bsaleData,
        sucursal_destino_nombre: storeInfo.nombre,
        bsale_guide_id: bsaleData?.guide?.id || bsaleData?.id || null
      })
      .select()
      .single();

    if (transferError) throw transferError;

    // Save transfer details with consolidated items
    const detailsToInsert = consolidatedItems.map((item) => {
      const variant = variants?.find(v => v.sku === item.sku);
      return {
        traslado_id: transferData.id,
        sku: item.sku,
        quantity: item.quantity,
        net_unit_value: Number(variant?.variant_value_12 || 0)
      };
    });

    const { error: detailsError } = await supabase
      .from('traslados_internos_detalle')
      .insert(detailsToInsert);

    if (detailsError) throw detailsError;

    // Get current session for optimistic locking and preserve notes
    const { data: currentSession, error: fetchError } = await supabase
      .from('picking_libre_sessions')
      .select('data_version, notes')
      .eq('id', sessionId)
      .single();

    if (fetchError || !currentSession) {
      throw new Error('Failed to fetch session for optimistic locking');
    }

    // Update picking session
    await supabase
      .from('picking_libre_sessions')
      .update({ 
        status: 'completado',
        completed_at: new Date().toISOString(),
        url_public_view: bsaleData?.guide?.urlPublicView || bsaleData?.urlPublicView,
        bsale_response: bsaleData,
        notes: currentSession.notes // Preserve picker info
      })
      .eq('id', sessionId);

    // ========================================================================
    // PASO 5: CONSUMIR STOCK (SISTEMA 2 ESTADOS)
    // ========================================================================
    console.log('');
    console.log('🔵 ========================================================================');
    console.log('🔵 PASO 5: CONSUMIR STOCK RESERVADO (Sistema 2 Estados)');
    console.log('🔵 ========================================================================');
    console.log('📊 Estado antes del consumo:');
    console.log('   - Session ID:', sessionId);
    console.log('   - Session Version:', currentSession.data_version);
    console.log('   - Status actual: completado (en picking_libre_sessions)');
    console.log('   - Guía Remisión Bsale: EMITIDA ✓');
    console.log('');
    console.log('🎯 Objetivo: Mover stock de RESERVADO → 0');
    console.log('   Flujo: reservado - cantidad = 0');
    console.log('   Trigger recalculará: en_existencia = disponibles + reservado');
    console.log('');
    
    const maxRetries = 3;
    let consumeResult;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`🔄 Intento ${attempt}/${maxRetries} de consumo de stock...`);
      
      const { data, error } = await supabase.rpc('consume_picking_libre_stock_strict', { 
        p_session_id: sessionId,
        p_expected_version: currentSession.data_version
      });

      // Validar tanto error de Supabase COMO success del RPC
      if (!error && data && data[0]?.success === true) {
        consumeResult = data;
        console.log('');
        console.log('✅ ========================================================================');
        console.log('✅ CONSUMO DE STOCK EXITOSO');
        console.log('✅ ========================================================================');
        console.log('📊 Resultado del consumo:');
        console.log('   - Items actualizados:', data[0]?.items_updated);
        console.log('   - Nueva versión:', data[0]?.new_version);
        console.log('   - Método utilizado: 2_STATES (reservado → 0)');
        console.log('');
        console.log('📈 Estado del stock DESPUÉS del consumo:');
        console.log('   - reservado: REDUCIDO a 0');
        console.log('   - disponibles: SIN CAMBIOS');
        console.log('   - en_existencia: REDUCIDO automáticamente por trigger');
        console.log('   - comprometido: NO USADO (sistema 2 estados)');
        console.log('');
        console.log('✅ El stock físico en Abracadabra ahora coincide con Bsale');
        console.log('✅ ========================================================================');
        console.log('');
        break;
      }

      // Si el RPC retornó success: false, es un error de validación
      if (!error && data && data[0]?.success === false) {
        const validationError = data[0].error_message || 'Stock consumption validation failed';
        console.error('');
        console.error('❌ ========================================================================');
        console.error('❌ ERROR DE VALIDACIÓN EN CONSUMO');
        console.error('❌ ========================================================================');
        console.error('⚠️ El RPC consume_picking_libre_stock_strict retornó success: false');
        console.error('📋 Detalles del error:');
        console.error('   - Mensaje:', validationError);
        console.error('   - Session ID:', sessionId);
        console.error('   - Version esperada:', currentSession.data_version);
        console.error('');
        console.error('🔍 Posibles causas:');
        console.error('   1. Stock no reservado suficiente');
        console.error('   2. Version mismatch (optimistic locking)');
        console.error('   3. Sesión no encontrada');
        console.error('   4. Lock no disponible');
        console.error('❌ ========================================================================');
        console.error('');
        lastError = new Error(validationError);
        break; // No reintentar errores de validación
      }

      // Error de Supabase (conexión, timeout, etc)
      lastError = error;
      
      if (error?.message?.includes('version mismatch') && attempt < maxRetries) {
        console.warn('');
        console.warn('⚠️ ========================================================================');
        console.warn('⚠️ VERSION MISMATCH DETECTADO');
        console.warn('⚠️ ========================================================================');
        console.warn(`🔄 Intento ${attempt}/${maxRetries} falló por conflicto de versión`);
        console.warn('📊 Refrescando versión de sesión...');
        
        await new Promise(resolve => setTimeout(resolve, 100 * attempt)); // Exponential backoff
        
        // Refetch current version
        const { data: refetchedSession } = await supabase
          .from('picking_libre_sessions')
          .select('data_version')
          .eq('id', sessionId)
          .single();
        
        if (refetchedSession) {
          console.warn(`   - Versión anterior: ${currentSession.data_version}`);
          console.warn(`   - Versión actual: ${refetchedSession.data_version}`);
          currentSession.data_version = refetchedSession.data_version;
          console.warn('✓ Versión actualizada, reintentando...');
        }
        console.warn('⚠️ ========================================================================');
        console.warn('');
      } else {
        console.error('');
        console.error('❌ Error en intento', attempt, ':', error?.message);
        console.error('');
        break;
      }
    }

    if (lastError) {
      console.error('');
      console.error('🔴 ========================================================================');
      console.error('🔴 FALLO CRÍTICO EN CONSUMO DE STOCK');
      console.error('🔴 ========================================================================');
      console.error('⚠️ SITUACIÓN CRÍTICA: Guía emitida en BSale pero stock NO consumido');
      console.error('');
      console.error('📊 Estado actual del sistema:');
      console.error('   ✅ Guía Remisión Bsale: EMITIDA');
      console.error('   ✅ Traslado interno: GUARDADO en DB');
      console.error('   ❌ Stock en Abracadabra: AÚN RESERVADO (NO CONSUMIDO)');
      console.error('');
      console.error('🔧 Acciones necesarias:');
      console.error('   1. El stock quedó RESERVADO en la tabla stockxbin');
      console.error('   2. Hay INCONSISTENCIA entre Bsale y Abracadabra');
      console.error('   3. REQUIERE INTERVENCIÓN MANUAL para liberar reservas');
      console.error('');
      console.error('💡 Para corregir, ejecutar en Supabase:');
      console.error(`   SELECT release_stock_reservation('${sessionId}');`);
      console.error('');
      console.error('📋 Error técnico:', lastError.message);
      console.error('🔴 ========================================================================');
      console.error('');
      throw new Error('Guía emitida en BSale pero el stock NO se consumió en Abracadabra: ' + lastError.message);
    }

    // Update emission record as completed
    if (emissionRecordId) {
      console.log('📝 Updating emission record to completed:', emissionRecordId);
      const { error: updateError } = await supabase
        .from('picking_libre_emissions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          bsale_document_id: bsaleData.id,
          response_payload: bsaleData
        })
        .eq('id', emissionRecordId);
      
      if (updateError) {
        console.error('❌ Error updating emission record:', updateError);
      } else {
        console.log('✅ Emission record updated successfully');
      }
    }

    // ========================================================================
    // GENERACIÓN DE PRINT JOBS
    // ========================================================================
    console.log('');
    console.log('🖨️ ========================================================================');
    console.log('🖨️ GENERANDO PRINT JOBS');
    console.log('🖨️ ========================================================================');

    // Obtener información de la firma de verificación
    let verifiedByName: string | null = null;
    try {
      const { data: signatureInfo } = await supabase
        .from('order_signatures')
        .select('signed_by_name, signed_at')
        .eq('order_id', sessionId)
        .eq('order_type', 'picking_libre')
        .maybeSingle();
      
      verifiedByName = signatureInfo?.signed_by_name || null;
      console.log('   ✓ Información de firma obtenida:', verifiedByName || 'Sin verificador');
    } catch (err) {
      console.error('   ⚠️ Error obteniendo firma de verificación:', err);
    }

    // Obtener info completa de la sesión para los print jobs
    const { data: sessionInfo } = await supabase
      .from('picking_libre_sessions')
      .select('created_by_name, notes, tipo_movimiento, created_at, completed_at')
      .eq('id', sessionId)
      .single();

    console.log('   ✓ Información de sesión obtenida');

    // Print Job 1: Documento PDF de Bsale
    try {
      if (bsaleData?.guide?.urlPdf || bsaleData?.urlPdf) {
        const pdfUrl = bsaleData?.guide?.urlPdf || bsaleData?.urlPdf;
        await supabase.from('print_jobs').insert({
          tipo: 'documento_bsale',
          url_pdf: pdfUrl,
          fuente: 'picking_libre',
          referencia_id: sessionId,
          destino_impresora: 'ticket80'
        });
        console.log('   ✓ Print job creado: PDF Bsale');
      }
    } catch (err) {
      console.error('   ⚠️ Error creating PDF print job:', err);
    }

    // Print Job 2: Ticket de firma HTML
    try {
      const sessionCode = `PL-${sessionId!.substring(0, 8).toUpperCase()}`;

      const response = bsaleData as any;
      const serialNumber =
        response?.serialNumber ??
        response?.number ??
        response?.guide?.serialNumber ??
        response?.guide?.number ??
        undefined;

      let preparedByName: string | undefined =
        sessionInfo?.created_by_name || undefined;
      let productosRetiradosPor: string | undefined =
        sessionInfo?.created_by_name || undefined;

      const signerName =
        sessionInfo?.created_by_name || storeInfo?.nombre || 'Abracadabra';

      const signedAt =
        sessionInfo?.completed_at ||
        new Date().toISOString();

      const signatureData = {
        orderType: 'picking_libre',
        orderCode: sessionCode,
        destination: storeInfo?.nombre || 'Sin tienda',
        signerName,
        signedAt,
        documentType: 'Guía de Remisión',
        bsaleDocumentNumber: serialNumber,
        preparedBy: preparedByName,
        productosRetiradosPor,
        verifiedBy: verifiedByName
      };
      
      const ticketHtml = generateSignatureTicketHTML(signatureData);
      
      // Guardar en storage y crear print job
      const fileName = `signatures/picking-libre-${sessionId}.html`;
      await supabase.storage.from('print_assets').upload(fileName, ticketHtml, {
        contentType: 'text/html',
        upsert: true
      });
      
      const { data: publicUrl } = supabase.storage.from('print_assets').getPublicUrl(fileName);
      
      await supabase.from('print_jobs').insert({
        tipo: 'firma',
        url_pdf: publicUrl.publicUrl,
        fuente: 'picking_libre',
        referencia_id: sessionId,
        destino_impresora: 'ticket80'
      });
      console.log('   ✓ Print job creado: Ticket de firma HTML');
    } catch (err) {
      console.error('   ⚠️ Error creating signature ticket print job:', err);
    }

    // Print Job 3: Sticker 100x100 HTML
    try {
      const sessionCode = `PL-${sessionId!.substring(0, 8).toUpperCase()}`;

      const labelData = {
        code: sessionCode,
        destination: storeInfo?.nombre || storeInfo?.recipient || '',
        date: new Date().toLocaleDateString('es-PE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }),
        itemsCount: selectedItems?.length ?? 0,
        movementType: 'GUÍA DE REMISIÓN',
        productosRetiradosPor:
          sessionInfo?.created_by_name || undefined,
        verifiedBy: verifiedByName
      };
      
      const labelHtml = generateTransferLabelHTML(labelData);
      
      const labelFileName = `labels/picking-libre-${sessionId}.html`;
      await supabase.storage.from('print_assets').upload(labelFileName, labelHtml, {
        contentType: 'text/html',
        upsert: true
      });
      
      const { data: labelPublicUrl } = supabase.storage.from('print_assets').getPublicUrl(labelFileName);
      
      await supabase.from('print_jobs').insert({
        tipo: 'sticker',
        url_pdf: labelPublicUrl.publicUrl,
        fuente: 'picking_libre',
        referencia_id: sessionId,
        destino_impresora: 'label'
      });
      console.log('   ✓ Print job creado: Sticker 100x100 HTML');
    } catch (err) {
      console.error('   ⚠️ Error creating transfer label print job:', err);
    }

    console.log('🖨️ ========================================================================');
    console.log('');

    console.log('');
    console.log('🎉 ========================================================================');
    console.log('🎉 PROCESO COMPLETADO EXITOSAMENTE');
    console.log('🎉 ========================================================================');
    console.log('✅ Resumen de operaciones:');
    console.log('   ✓ Guía de remisión emitida en Bsale');
    console.log('   ✓ Traslado guardado en base de datos');
    console.log('   ✓ Stock consumido correctamente (reservado → 0)');
    console.log('   ✓ en_existencia recalculado automáticamente');
    console.log('   ✓ Registro de emisión actualizado');
    console.log('');
    console.log('📊 Estado final del sistema:');
    console.log('   - Sesión: completado');
    console.log('   - Stock: disponibles + reservado(0) = en_existencia');
    console.log('   - Consistencia: Bsale ✓ = Abracadabra ✓');
    console.log('🎉 ========================================================================');
    console.log('');

    return new Response(
      JSON.stringify({ success: true, data: bsaleData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('');
    console.error('💥 ========================================================================');
    console.error('💥 ERROR EN PROCESO DE EMISIÓN DE GUÍA REMISIÓN');
    console.error('💥 ========================================================================');
    console.error('📋 Mensaje del error:', error.message);
    console.error('📍 Stack trace:', error.stack);
    console.error('');
    
    // CRITICAL: Release stock reservations if emission failed
    try {
      console.log('🔄 ========================================================================');
      console.log('🔄 LIBERANDO RESERVAS DE STOCK (Sistema 2 Estados)');
      console.log('🔄 ========================================================================');
      console.log('⚠️ Como el proceso falló, vamos a devolver el stock reservado a disponible');
      console.log('');
      console.log('📊 Acción a ejecutar:');
      console.log('   - Llamando a: release_stock_reservation()');
      console.log('   - Session ID:', sessionId);
      console.log('   - Flujo: reservado → disponibles');
      console.log('');
      
      const { data: releaseResult, error: releaseError } = await supabase.rpc('release_stock_reservation', {
        p_session_id: sessionId
      });
      
      if (releaseError) {
        console.error('');
        console.error('❌ ========================================================================');
        console.error('❌ ERROR LIBERANDO RESERVAS DE STOCK');
        console.error('❌ ========================================================================');
        console.error('⚠️ CRÍTICO: Las reservas NO se pudieron liberar automáticamente');
        console.error('📋 Error:', releaseError.message);
        console.error('');
        console.error('🔧 ACCIÓN MANUAL REQUERIDA:');
        console.error(`   Ejecutar en Supabase SQL Editor:`);
        console.error(`   SELECT release_stock_reservation('${sessionId}');`);
        console.error('❌ ========================================================================');
        console.error('');
      } else {
        console.log('');
        console.log('✅ ========================================================================');
        console.log('✅ RESERVAS LIBERADAS EXITOSAMENTE');
        console.log('✅ ========================================================================');
        console.log('📊 Resultado:');
        console.log('   - Items liberados:', releaseResult?.items_released || 'N/A');
        console.log('   - Stock devuelto: reservado → disponibles');
        console.log('');
        console.log('✅ El stock volvió a estar disponible para otras operaciones');
        console.log('✅ ========================================================================');
        console.log('');
      }
    } catch (releaseErr) {
      console.error('❌ Exception releasing stock:', releaseErr);
    }
    
    // Update emission record as failed (using stored sessionId, no double-read)
    try {
      if (emissionRecordId) {
        await supabase
          .from('picking_libre_emissions')
          .update({
            status: 'failed',
            error_message: error.message,
            error_details: {
              stack: error.stack,
              name: error.name
            }
          })
          .eq('id', emissionRecordId);
      } else if (sessionId) {
        // Fallback: search by session_id if we don't have emission record ID yet
        await supabase
          .from('picking_libre_emissions')
          .update({
            status: 'failed',
            error_message: error.message,
            error_details: {
              stack: error.stack,
              name: error.name
            }
          })
          .eq('session_id', sessionId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1);
      }

      // Update session status to error
      if (sessionId) {
        await supabase
          .from('picking_libre_sessions')
          .update({
            status: 'error',
            last_error: error.message
          })
          .eq('id', sessionId);
      }
    } catch (updateError) {
      console.error('Failed to update emission record on error:', updateError);
    }

    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.stack
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
