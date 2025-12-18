interface SignatureTicketData {
  orderType: "pedido" | "venta" | "picking_libre";
  orderCode: string;
  destination: string; // Store name or client name
  signerName: string;
  signedAt: string; // ISO string
  documentType?: string; // Optional: type of document issued
  bsaleDocumentNumber?: string; // Optional: Bsale document serial number
  preparedBy?: string; // Optional: name of picker who prepared the order
  productosRetiradosPor?: string; // Optional: name of person who physically picks up products
}

const getOrderTypeLabel = (orderType: string): string => {
  switch (orderType) {
    case "pedido":
      return "PEDIDO";
    case "venta":
      return "VENTA";
    case "picking_libre":
      return "PICKING LIBRE";
    default:
      return "ORDEN";
  }
};

const formatDateTime = (isoString: string): { date: string; time: string } => {
  const date = new Date(isoString);
  return {
    date: date.toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }),
    time: date.toLocaleTimeString("es-PE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
};

const generateTicketHTML = (data: SignatureTicketData): string => {
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
      ${
        data.productosRetiradosPor
          ? `
      <div class="divider" style="margin: 6px 0;">- - - - - - - - - - - - - - - - - - - - - -</div>
      
      <div class="label">Productos retirados por:</div>
      <div class="value">${data.productosRetiradosPor}</div>
      `
          : ""
      }
      
      <div class="divider" style="margin: 6px 0;">- - - - - - - - - - - - - - - - - - - - - -</div>
      
      <div class="label">Fecha:</div>
      <div class="value">${date}</div>
      
      <div class="label">Hora:</div>
      <div class="value">${time}</div>
    </div>
    
    ${
      data.documentType
        ? `
    <div class="divider">-----------------------------------</div>
    
    <div class="section">
      <div class="label">Tipo de documento:</div>
      <div class="value">${data.documentType}</div>
    </div>
    `
        : ""
    }
    
    ${
      data.bsaleDocumentNumber
        ? `
    <div class="divider">-----------------------------------</div>
    
    <div class="section">
      <div class="label">Identificador Bsale:</div>
      <div class="value">${data.bsaleDocumentNumber}</div>
    </div>
    `
        : ""
    }
    
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

export const printSignatureTicket = (data: SignatureTicketData): Promise<boolean> => {
  return new Promise((resolve) => {
    try {
      // Generate HTML content
      const ticketHTML = generateTicketHTML(data);

      // Create a hidden iframe for printing
      const printFrame = document.createElement("iframe");
      printFrame.style.position = "fixed";
      printFrame.style.top = "-9999px";
      printFrame.style.left = "-9999px";
      printFrame.style.width = "80mm";
      printFrame.style.height = "100%";

      document.body.appendChild(printFrame);

      // Write content to iframe
      const frameDoc = printFrame.contentWindow?.document;
      if (!frameDoc) {
        throw new Error("No se pudo acceder al documento del iframe");
      }

      frameDoc.open();
      frameDoc.write(ticketHTML);
      frameDoc.close();

      // Wait for content to load, then print
      printFrame.contentWindow?.focus();

      setTimeout(() => {
        try {
          printFrame.contentWindow?.print();

          // Clean up after printing
          setTimeout(() => {
            document.body.removeChild(printFrame);
            resolve(true);
          }, 100);
        } catch (printError) {
          console.error("Error printing:", printError);
          document.body.removeChild(printFrame);
          resolve(false);
        }
      }, 250);
    } catch (error) {
      console.error("Error setting up print:", error);
      resolve(false);
    }
  });
};
