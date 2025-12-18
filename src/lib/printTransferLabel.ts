interface TransferLabelData {
  sessionId: string;
  completedAt: string;
  createdByName: string;
  pickerName?: string;
  destinationStore?: string;
  bsaleDocumentNumber?: string;
  productosRetiradosPor?: string;
  tipoMovimiento?: string;
  totalItems?: number;
}

function formatDateTime(isoString: string): { date: string; time: string } {
  const date = new Date(isoString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return {
    date: `${day}/${month}/${year}`,
    time: `${hours}:${minutes}`
  };
}

function getPickingLibreCode(id: string): string {
  return `PL-${id.substring(0, 8).toUpperCase()}`;
}

function generateLabelHTML(data: TransferLabelData): string {
  const { date, time } = formatDateTime(data.completedAt);
  const pickingCode = getPickingLibreCode(data.sessionId);
  
  const tipoMovimientoTexto = data.tipoMovimiento 
    ? {
        'venta_directa': 'VENTA DIRECTA',
        'reposicion': 'REPOSICIÓN',
        'traslado': 'TRASLADO'
      }[data.tipoMovimiento] || 'TRANSFERENCIA'
    : 'TRANSFERENCIA';

  const barcodeUrl = `https://barcode.tec-it.com/barcode.ashx?data=${encodeURIComponent(pickingCode)}&code=Code128&translate-esc=on`;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Etiqueta de Transferencia</title>
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
          <span class="value">${date} ${time}</span>
        </div>
        <div class="info-line">
          <span class="label">Emitido por:</span>
          <span class="value">${data.createdByName}</span>
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
        <div class="destination-value">${data.destinationStore || 'Sin destino'}</div>
        ${data.totalItems ? `
        <div class="info-line" style="margin-top: 2mm;">
          <span class="label">Total unidades:</span>
          <span class="value">${data.totalItems}</span>
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

export async function printTransferLabel(data: TransferLabelData): Promise<boolean> {
  try {
    const html = generateLabelHTML(data);
    
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      throw new Error('No se pudo abrir la ventana de impresión');
    }
    
    printWindow.document.write(html);
    printWindow.document.close();
    
    // Esperar a que la imagen del código de barras cargue
    const img = printWindow.document.querySelector('.barcode-img') as HTMLImageElement;
    if (img) {
      await new Promise<void>((resolve) => {
        if (img.complete) {
          resolve();
        } else {
          img.onload = () => resolve();
          img.onerror = () => resolve(); // Continuar aunque falle
        }
      });
    }
    
    // Timeout adicional de seguridad
    await new Promise(resolve => setTimeout(resolve, 300));
    
    printWindow.focus();
    printWindow.print();
    
    return true;
  } catch (error) {
    console.error('Error al imprimir etiqueta:', error);
    return false;
  }
}
