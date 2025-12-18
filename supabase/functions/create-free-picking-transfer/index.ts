import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

const BSALE_API_URL = 'https://api.bsale.io/v1';
const BSALE_ACCESS_TOKEN = Deno.env.get('BSALE_ACCESS_TOKEN');

// ==== HELPERS PARA FIRMA Y STICKER =========================================

const getOrderTypeLabel = (orderType: string) => {
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
};

const formatDateTime = (isoString: string) => {
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
};

const generateSignatureTicketHTML = (data: any) => {
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
};

const generateTransferLabelHTML = (data: any) => {
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
};

// ==== FUNCIÓN PRINCIPAL ====================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  let sessionId: string | undefined;
  let emissionRecordId: string | null = null;

  try {
    const body = await req.json();
    sessionId = body.sessionId;
    const storeId = body.storeId;
    const selectedItems = body.selectedItems;
    const expectedVersion = body.expectedVersion;

    console.log('');
    console.log('🟢 ========================================================================');
    console.log('🟢 INICIO: EMISIÓN DE TRASLADO PICKING LIBRE (Sistema 2 Estados)');
    console.log('🟢 ========================================================================');

    // -----------------------------------------------------------------------
    // 1) Validar duplicados
    // -----------------------------------------------------------------------
    const { data: existingEmission, error: checkError } = await supabase
      .from('picking_libre_emissions')
      .select('id, bsale_document_id, completed_at')
      .eq('session_id', sessionId)
      .eq('status', 'completed')
      .maybeSingle();

    if (checkError) {
      console.error('Error checking for existing emissions:', checkError);
      throw new Error('Error verificando emisiones previas');
    }
    if (existingEmission) {
      console.warn('⚠️ DUPLICACIÓN PREVENIDA: Ya existe una emisión completada para esta sesión');
      throw new Error(
        `Esta sesión ya fue emitida exitosamente (Documento BSale: ${existingEmission.bsale_document_id}). ` +
          'Si necesitas crear una nueva emisión, inicia una nueva sesión de picking.'
      );
    }

    const idempotencyKey = `transfer_${sessionId}_${Date.now()}`;

    const { data: emissionRecord, error: emissionInsertError } = await supabase
      .from('picking_libre_emissions')
      .insert({
        session_id: sessionId,
        idempotency_key: idempotencyKey,
        emission_type: 'transfer',
        status: 'pending',
        request_payload: {
          sessionId,
          storeId,
          selectedItems,
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

    // -----------------------------------------------------------------------
    // 2) Info de tienda
    // -----------------------------------------------------------------------
    const { data: storeInfo, error: storeError } = await supabase
      .from('tiendas')
      .select('*')
      .eq('id', storeId)
      .single();

    if (storeError || !storeInfo) {
      throw new Error('Store not found');
    }

    const isInnovacion = storeInfo.pertenenceinnovacion === true;

    if (
      !isInnovacion &&
      (!storeInfo.recipient_ruc || storeInfo.recipient_ruc.toString().trim() === '')
    ) {
      console.error('External transfer requires RUC but none found for store:', storeInfo.nombre);
      throw new Error(
        'La tienda seleccionada no tiene RUC configurado. Edite la tienda y agregue el RUC para poder emitir traslados externos.'
      );
    }

    const emissionDate = Math.floor(Date.now() / 1000);

    // -----------------------------------------------------------------------
    // 3) Consolidar ítems por SKU
    // -----------------------------------------------------------------------
    const consolidatedMap = new Map<string, { sku: string; quantity: number }>();
    for (const item of selectedItems) {
      let qty = Number(item.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        console.warn(`⚠️ Cantidad inválida para SKU ${item.sku}: ${item.quantity}, usando 1`);
        qty = 1;
      }
      const existing = consolidatedMap.get(item.sku);
      if (existing) {
        existing.quantity += qty;
      } else {
        consolidatedMap.set(item.sku, {
          sku: item.sku,
          quantity: qty
        });
      }
    }
    const consolidatedItems = Array.from(consolidatedMap.values());
    console.log('Consolidated items by SKU:', consolidatedItems);

    // Consolidar variant data en un solo lugar para reutilizar en ambos POSTs
    const variantDataMap = new Map();
    for (const item of consolidatedItems) {
      const { data: variantData, error: variantError } = await supabase
        .from('variants')
        .select('variant_value_12, nombreProducto, costo, lista_x_12')
        .eq('sku', item.sku)
        .single();

      if (variantError || !variantData) {
        console.error(
          `Error fetching variant data for SKU ${item.sku}:`,
          variantError
        );
        throw new Error(`No se encontró información del producto para SKU: ${item.sku}`);
      }
      
      variantDataMap.set(item.sku, variantData);
    }

    const details: { quantity: number; code: string; netUnitValue: number }[] = [];
    for (const item of consolidatedItems) {
      const variantData = variantDataMap.get(item.sku);

      const netValue = parseFloat(variantData.variant_value_12 || '0');
      const finalNetValue = netValue > 0 ? netValue : 1;
      if (netValue <= 0) {
        console.warn(
          `Product ${item.sku} (${variantData.nombreProducto}) has invalid cost ${netValue}, using 1 as default`
        );
      }

      details.push({
        quantity: item.quantity,
        code: item.sku,
        netUnitValue: finalNetValue
      });
    }

    // -----------------------------------------------------------------------
    // 4) Payload Bsale
    // -----------------------------------------------------------------------
    let bsalePayload: any;
    if (isInnovacion) {
      bsalePayload = {
        documentTypeId: 37,
        officeId: 17,
        emissionDate,
        shippingTypeId: 5,
        destinationOfficeId: parseInt(storeInfo.officeid),
        district: 'Lima',
        city: 'Lima',
        address: 'Prol. Lucanas 1043',
        declare: 1,
        recipient: 'Innovación Textil',
        details,
        client: {
          code: '20485935691',
          district: storeInfo.district || 'Lima',
          company: 'Innovacion Textil S.A.C.',
          city: storeInfo.city || 'Lima',
          address: storeInfo.address || 'Prol. Lucanas 1043'
        }
      };
    } else {
      bsalePayload = {
        documentTypeId: 37,
        officeId: 17,
        emissionDate,
        shippingTypeId: 10,
        district: storeInfo.district || 'Lima',
        city: storeInfo.city || 'Lima',
        address: storeInfo.address || '',
        declare: 0,
        recipient: storeInfo.recipient || '',
        details,
        client: {
          code: storeInfo.recipient_ruc?.toString() || '',
          district: storeInfo.district || 'Lima',
          company: storeInfo.recipient || '',
          city: storeInfo.city || 'Lima',
          address: storeInfo.address || ''
        }
      };
    }

    console.log('Sending transfer to Bsale:', JSON.stringify(bsalePayload, null, 2));

    const bsaleResponse = await fetch(`${BSALE_API_URL}/shippings.json`, {
      method: 'POST',
      headers: {
        access_token: BSALE_ACCESS_TOKEN!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bsalePayload)
    });

    const bsaleData = await bsaleResponse.json();
    console.log('Bsale response status:', bsaleResponse.status);
    console.log('Bsale response data:', bsaleData);

    if (!bsaleResponse.ok) {
      throw new Error(
        `BSale API error: ${bsaleResponse.status} - ${JSON.stringify(bsaleData)}`
      );
    }


    // -----------------------------------------------------------------------
    // 5) Guardar traslado interno
    // -----------------------------------------------------------------------
    const { data: nextDocNumber, error: numberError } = await supabase.rpc(
      'get_next_transfer_number'
    );
    if (numberError) {
      console.error('Error getting next transfer number:', numberError);
      throw numberError;
    }

    const urlPublicView = bsaleData?.guide?.urlPublicView || null;

    const { data: transferData, error: transferError } = await supabase
      .from('traslados_internos')
      .insert({
        document_number: nextDocNumber,
        emission_date: emissionDate,
        office_id: 17,
        destination_office_id: storeInfo.officeid,
        recipient: isInnovacion ? 'Innovación Textil' : storeInfo.recipient || '',
        address: isInnovacion ? 'Prol. Lucanas 1043' : storeInfo.address || '',
        city: isInnovacion ? 'Lima' : storeInfo.city || 'Lima',
        district: isInnovacion ? 'Lima' : storeInfo.district || 'Lima',
        total_items: consolidatedItems.reduce((sum, item) => sum + item.quantity, 0),
        tienda_id: storeInfo.id,
        url_public_view: urlPublicView,
        bsale_response: bsaleData,
        sucursal_destino_nombre: storeInfo.nombre,
        bsale_guide_id: bsaleData?.guide?.id || null
      })
      .select()
      .single();

    if (transferError) {
      console.error('Error saving transfer:', transferError);
      throw transferError;
    }

    for (const detail of details) {
      const { error: detailError } = await supabase
        .from('traslados_internos_detalle')
        .insert({
          traslado_id: transferData.id,
          sku: detail.code,
          quantity: detail.quantity,
          net_unit_value: detail.netUnitValue
        });

      if (detailError) {
        console.error('Error saving transfer detail:', detailError);
      }
    }

    // -----------------------------------------------------------------------
    // 6) Obtener datos de sesión para consumo de stock
    // -----------------------------------------------------------------------
    const { data: currentSession, error: fetchError } = await supabase
      .from('picking_libre_sessions')
      .select(
        'data_version, notes, created_by_name, productos_retirados_por, tipo_movimiento, documento_tipo, completed_at, status'
      )
      .eq('id', sessionId)
      .single();

    if (fetchError || !currentSession) {
      throw new Error('Failed to fetch session for optimistic locking');
    }

    // -----------------------------------------------------------------------
    // 7) Consumir stock ANTES de marcar como completado (Sistema 2 Estados)
    // -----------------------------------------------------------------------
    console.log('🔄 Iniciando consumo de stock (ANTES de marcar completado)...');
    const maxRetries = 3;
    let lastError: any;
    let stockConsumed = false;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`   Intento ${attempt}/${maxRetries} - data_version: ${currentSession.data_version}`);
      
      const { data, error } = await supabase.rpc('consume_picking_libre_stock_strict', {
        p_session_id: sessionId,
        p_expected_version: currentSession.data_version
      });

      if (!error && data && data[0]?.success === true) {
        console.log('✅ Stock consumido exitosamente');
        stockConsumed = true;
        break;
      }

      if (!error && data && data[0]?.success === false) {
        const validationError =
          data[0].error_message || 'Stock consumption validation failed';
        lastError = new Error(validationError);
        console.error(`❌ Consumo falló con validación: ${validationError}`);
        break;
      }

      lastError = error;
      console.error(`❌ Error en intento ${attempt}:`, error?.message);
      
      if (error?.message?.includes('version mismatch') && attempt < maxRetries) {
        const { data: refetchedSession } = await supabase
          .from('picking_libre_sessions')
          .select('data_version')
          .eq('id', sessionId)
          .single();
        if (refetchedSession) {
          currentSession.data_version = refetchedSession.data_version;
          console.log(`   Actualizando data_version a: ${refetchedSession.data_version}`);
        }
      } else {
        break;
      }
    }

    // Si el stock no se consumió, NO marcar como completado
    if (!stockConsumed || lastError) {
      console.error('❌ STOCK NO CONSUMIDO - Sesión NO se marcará como completada');
      throw new Error(
        'Documento emitido en BSale pero el stock NO se consumió en Abracadabra: ' +
          (lastError?.message || 'Unknown error')
      );
    }

    // -----------------------------------------------------------------------
    // 8) SOLO SI el stock se consumió exitosamente, marcar sesión como completada
    // -----------------------------------------------------------------------
    console.log('✅ Stock consumido - Marcando sesión como completada...');
    const { error: updateSessionError } = await supabase
      .from('picking_libre_sessions')
      .update({
        status: 'completado',
        completed_at: new Date().toISOString(),
        url_public_view: urlPublicView,
        bsale_response: bsaleData,
        notes: currentSession.notes
      })
      .eq('id', sessionId);

    if (updateSessionError) {
      console.error('⚠️ Error actualizando sesión a completado:', updateSessionError);
      // No lanzar error aquí porque el stock ya se consumió correctamente
    }

    // -----------------------------------------------------------------------
    // 9) Marcar emisión como completada
    // -----------------------------------------------------------------------
    if (emissionRecordId) {
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
      }
    }

    // -----------------------------------------------------------------------
    // 10) CREAR PRINT_JOBS (PDF BSALE + FIRMA + STICKER)
    // -----------------------------------------------------------------------

    // Documento de Bsale (PDF → ticket80)
    try {
      const urlPdf =
        bsaleData?.guide?.urlPdf ?? bsaleData?.guide?.urlPDF ?? null;

      if (!urlPdf) {
        console.warn(
          'create-free-picking-transfer: no se encontró guide.urlPdf en bsaleData, no se creó print_job'
        );
      } else {
        const { error: printJobError } = await supabase
          .from('print_jobs')
          .insert({
            tipo: 'documento_bsale',
            fuente: 'picking_libre',
            referencia_id: sessionId,
            url_pdf: urlPdf,
            destino_impresora: 'ticket80'
          });

        if (printJobError) {
          console.error(
            'create-free-picking-transfer: error creando print_job de documento_bsale',
            printJobError
          );
        }
      }
    } catch (err) {
      console.error(
        'create-free-picking-transfer: error inesperado creando print_job documento_bsale',
        err
      );
    }

    // Obtener información de la firma de verificación (fuera de los try blocks)
    let verifiedByName: string | null = null;
    try {
      const { data: signatureInfo } = await supabase
        .from('order_signatures')
        .select('signed_by_name, signed_at')
        .eq('order_id', sessionId)
        .eq('order_type', 'picking_libre')
        .maybeSingle();
      
      verifiedByName = signatureInfo?.signed_by_name || null;
    } catch (err) {
      console.error('create-free-picking-transfer: error obteniendo firma de verificación:', err);
    }

    // Ticket de firma (HTML en storage → ticket80)
    try {
      const sessionCode = `PL-${sessionId!.substring(0, 8).toUpperCase()}`;

      let documentTypeLabel: string | undefined;
      if (currentSession?.documento_tipo === 'remision') {
        documentTypeLabel = 'Guía de Remisión';
      } else if (currentSession?.documento_tipo === 'traslado') {
        documentTypeLabel = 'Traslado Interno';
      }

      const response = bsaleData as any;
      const serialNumber =
        response?.serialNumber ??
        response?.number ??
        response?.guide?.serialNumber ??
        response?.guide?.number ??
        undefined;

      let preparedByName: string | undefined =
        currentSession?.created_by_name || undefined;
      let productosRetiradosPor: string | undefined =
        currentSession?.productos_retirados_por || undefined;

      if (currentSession?.notes) {
        try {
          const notesData = JSON.parse(currentSession.notes as string);
          if (notesData.picker_name) {
            preparedByName = notesData.picker_name;
          }
          if (notesData.productos_retirados_por && !productosRetiradosPor) {
            productosRetiradosPor = notesData.productos_retirados_por;
          }
        } catch {
          // ignorar
        }
      }

      const signerName =
        currentSession?.created_by_name || storeInfo?.nombre || 'Abracadabra';

      const signedAt =
        currentSession?.completed_at ||
        new Date().toISOString();

      const signatureData = {
        orderType: 'picking_libre',
        orderCode: sessionCode,
        destination: storeInfo?.nombre || 'Sin tienda',
        signerName,
        signedAt,
        documentType: documentTypeLabel,
        bsaleDocumentNumber: serialNumber,
        preparedBy: preparedByName,
        productosRetiradosPor,
        verifiedBy: verifiedByName
      };

      const html = generateSignatureTicketHTML(signatureData);
      const path = `signatures/picking_libre-${sessionId}.html`;

      const { error: uploadError } = await supabase.storage
        .from('print_assets')
        .upload(path, new Blob([html], { type: 'text/html' }), {
          upsert: true,
          contentType: 'text/html'
        });

      if (uploadError) {
        console.error(
          'create-free-picking-transfer: error subiendo HTML de firma a Storage',
          uploadError
        );
      } else {
        const { data: publicData } = supabase.storage
          .from('print_assets')
          .getPublicUrl(path);

        const signatureUrl = publicData.publicUrl;

        const { error: signatureJobError } = await supabase
          .from('print_jobs')
          .insert({
            tipo: 'firma',
            fuente: 'picking_libre',
            referencia_id: sessionId,
            url_pdf: signatureUrl,
            destino_impresora: 'ticket80'
          });

        if (signatureJobError) {
          console.error(
            'create-free-picking-transfer: error creando print_job de firma',
            signatureJobError
          );
        }
      }
    } catch (err) {
      console.error(
        'create-free-picking-transfer: error inesperado generando ticket de firma',
        err
      );
    }

    // Sticker 100x100 (HTML en storage → label)
    try {
      const sessionCode = `PL-${sessionId!.substring(0, 8).toUpperCase()}`;

      const labelData = {
        code: sessionCode,
        destination: storeInfo?.nombre || storeInfo?.recipient || '',
        date: new Date(emissionDate * 1000).toLocaleDateString('es-PE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }),
        itemsCount: transferData?.total_items ?? details.length ?? 0,
        movementType: currentSession?.tipo_movimiento || 'Traslado',
        productosRetiradosPor:
          currentSession?.productos_retirados_por || undefined,
        verifiedBy: verifiedByName
      };

      const labelHtml = generateTransferLabelHTML(labelData);
      const labelPath = `labels/picking_libre-${sessionId}.html`;

      const { error: labelUploadError } = await supabase.storage
        .from('print_assets')
        .upload(labelPath, new Blob([labelHtml], { type: 'text/html' }), {
          upsert: true,
          contentType: 'text/html'
        });

      if (labelUploadError) {
        console.error(
          'create-free-picking-transfer: error subiendo HTML de etiqueta a Storage',
          labelUploadError
        );
      } else {
        const { data: labelPublicData } = supabase.storage
          .from('print_assets')
          .getPublicUrl(labelPath);

        const labelUrl = labelPublicData.publicUrl;

        const { error: labelJobError } = await supabase
          .from('print_jobs')
          .insert({
            tipo: 'sticker',
            fuente: 'picking_libre',
            referencia_id: sessionId,
            url_pdf: labelUrl,
            destino_impresora: 'label'
          });

        if (labelJobError) {
          console.error(
            'create-free-picking-transfer: error creando print_job de sticker',
            labelJobError
          );
        }
      }
    } catch (err) {
      console.error(
        'create-free-picking-transfer: error inesperado generando etiqueta de traslado',
        err
      );
    }

    // -----------------------------------------------------------------------
    // 11) Respuesta OK
    // -----------------------------------------------------------------------
    return new Response(
      JSON.stringify({
        success: true,
        data: bsaleData
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (error: any) {
    console.error('❌ ERROR EN create-free-picking-transfer:', error?.message);
    console.error('   Stack:', error?.stack);

    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      // 1) Liberar reservas de stock
      if (sessionId) {
        console.log('🔄 Liberando reservas de stock para sesión:', sessionId);
        const { error: releaseError } = await supabase.rpc('release_stock_reservation', {
          p_session_id: sessionId
        });
        if (releaseError) {
          console.error('⚠️ Error liberando reservas:', releaseError.message);
        } else {
          console.log('✅ Reservas liberadas correctamente');
        }
        
        // 2) Revertir status a 'verificado' para permitir reintento
        // Si está en 'emitiendo' o 'completado' sin éxito, volver a estado retryable
        const { data: sessionStatus } = await supabase
          .from('picking_libre_sessions')
          .select('status')
          .eq('id', sessionId)
          .single();
        
        if (sessionStatus?.status === 'emitiendo' || sessionStatus?.status === 'completado') {
          console.log(`⚠️ Sesión en "${sessionStatus.status}" tras error - Revirtiendo a "verificado" para permitir reintento`);
          await supabase
            .from('picking_libre_sessions')
            .update({ 
              status: 'verificado',
              last_error: `Error en emisión: ${error.message}`,
              updated_at: new Date().toISOString()
            })
            .eq('id', sessionId);
        }
      }

      // 3) Marcar emisión como fallida
      if (emissionRecordId) {
        await supabase
          .from('picking_libre_emissions')
          .update({
            status: 'failed',
            error_message: error.message,
            error_details: {
              stack: error.stack,
              name: error.name,
              timestamp: new Date().toISOString()
            }
          })
          .eq('id', emissionRecordId);
      }
    } catch (e: any) {
      console.error('❌ Error while handling failure:', e?.message);
    }

    return new Response(
      JSON.stringify({
        error: error.message,
        details: error.stack
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
