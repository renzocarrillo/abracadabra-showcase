// Helper function to make Bsale API requests
export async function makeBsaleRequest(endpoint: string, payload: any) {
  const bsaleAccessToken = Deno.env.get('BSALE_ACCESS_TOKEN')
  if (!bsaleAccessToken) {
    throw new Error('BSALE_ACCESS_TOKEN not configured')
  }

  console.log(`Making request to Bsale API: ${endpoint}`)
  console.log('Payload:', JSON.stringify(payload, null, 2))

  const response = await fetch(`https://api.bsale.io/v1/${endpoint}`, {
    method: 'POST',
    headers: {
      'access_token': bsaleAccessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  const result = await response.json()
  console.log('Bsale response:', result)

  if (!response.ok) {
    console.error('Bsale API error:', result)
    throw new Error(`Bsale API error: ${JSON.stringify(result)}`)
  }

  return result
}

// Helper function to build boleta client object
export function buildBoletaClient(clienteInfo: any) {
  const clientDNI = clienteInfo.ruc || clienteInfo.code
  const clientEmail = clienteInfo.email
  const rawFirstName = (clienteInfo.firstName ?? (clienteInfo.nombre ? String(clienteInfo.nombre).split(' ')[0] : '')).trim()
  const rawLastName = (clienteInfo.lastName ?? (clienteInfo.nombre ? String(clienteInfo.nombre).split(' ').slice(1).join(' ') : '')).trim()

  if (!clientDNI || !clientEmail) {
    throw new Error('Para emitir boleta se requiere DNI y email del cliente')
  }

  return {
    code: clientDNI,
    email: clientEmail,
    firstName: rawFirstName || '',
    lastName: rawLastName || ''
  }
}

// Helper function to build factura client object
export function buildFacturaClient(clienteInfo: any, facturacionInfo: any) {
  // Ensure we have required client information
  if (!clienteInfo.ruc || !clienteInfo.razonSocial || !clienteInfo.email) {
    throw new Error('Missing required client information for invoice: RUC, Razón Social, and Email are required')
  }

  return {
    code: clienteInfo.ruc,
    city: facturacionInfo.ciudad || "LIMA",
    company: clienteInfo.razonSocial,
    municipality: facturacionInfo.provincia || "Lima",
    activity: "Venta de accesorios de vestir", // Default activity
    address: facturacionInfo.direccion || "",
    email: clienteInfo.email,
    companyOrPerson: 1 // Always 1 for companies
  }
}

// Helper function to build boleta payload
export function buildBoletaPayload(venta: any, ventaDetails: any[], details: any[], paymentTypeId: number, emissionDate: number, generateGuide: boolean) {
  const clienteInfo = venta.cliente_info || {}
  const client = buildBoletaClient(clienteInfo)

  // Calculate total with IGV
  const totalBrutoConIGV = ventaDetails.reduce((sum, item) => {
    return sum + (item.precio_unitario * item.cantidad)
  }, 0)

  return {
    documentTypeId: 119, // Boleta
    officeId: 17, // ALMCENTRAL
    priceListId: 31, // Lista por mayor
    sellerId: venta.seller_id, // ID del vendedor desde la venta
    emissionDate: emissionDate,
    expirationDate: emissionDate,
    declare: 1,
    dispatch: generateGuide ? 0 : 1, // 1 = entrega inmediata, 0 = necesita guía
    client: client,
    sendEmail: 1,
    details: details,
    payments: [{
      paymentTypeId: paymentTypeId,
      amount: totalBrutoConIGV,
      recordDate: emissionDate
    }]
  }
}

// Helper function to build factura payload
export function buildFacturaPayload(venta: any, details: any[], paymentTypeId: number, emissionDate: number, generateGuide: boolean) {
  const facturacionInfo = venta.facturacion_info || venta.envio_info
  const clienteInfo = venta.cliente_info
  const client = buildFacturaClient(clienteInfo, facturacionInfo)

  return {
    documentTypeId: 120, // Always 120 for invoices
    officeId: 17, // ALMcentral
    emissionDate: emissionDate,
    expirationDate: emissionDate,
    declare: 1,
    priceListId: 31, // Always 31
    sellerId: venta.seller_id,
    dispatch: generateGuide ? 0 : 1, // 1: sin guía (entrega inmediata), 0: con guía (entrega posterior)
    client: client,
    sendEmail: 1,
    details: details,
    payments: [
      {
        paymentTypeId: paymentTypeId,
        amount: Number(venta.total),
        recordDate: emissionDate
      }
    ]
  }
}

// Helper function to build ticket natural payload
export function buildTicketNaturalPayload(venta: any, ventaDetails: any[], details: any[], paymentTypeId: number, emissionDate: number) {
  const clienteInfo = venta.cliente_info || {}
  const client = buildBoletaClient(clienteInfo)

  // Calculate total with IGV
  const totalBrutoConIGV = ventaDetails.reduce((sum, item) => {
    return sum + (item.precio_unitario * item.cantidad)
  }, 0)

  return {
    documentTypeId: 10, // Ticket
    officeId: 17, // ALMCENTRAL
    priceListId: 31, // Lista por mayor
    sellerId: venta.seller_id,
    emissionDate: emissionDate,
    expirationDate: emissionDate,
    declare: 0, // Siempre 0 para tickets
    dispatch: 1, // Siempre 1 porque no se puede emitir guía
    client: client,
    sendEmail: 1,
    details: details,
    payments: [{
      paymentTypeId: paymentTypeId,
      amount: totalBrutoConIGV,
      recordDate: emissionDate
    }]
  }
}

// Helper function to build ticket empresa payload
export function buildTicketEmpresaPayload(venta: any, details: any[], paymentTypeId: number, emissionDate: number) {
  const facturacionInfo = venta.facturacion_info || venta.envio_info
  const clienteInfo = venta.cliente_info
  const client = buildFacturaClient(clienteInfo, facturacionInfo)

  return {
    documentTypeId: 10, // Ticket
    officeId: 17, // ALMcentral
    emissionDate: emissionDate,
    expirationDate: emissionDate,
    declare: 0, // Siempre 0 para tickets
    priceListId: 31, // Always 31
    sellerId: venta.seller_id,
    dispatch: 1, // Siempre 1 porque no se puede emitir guía
    client: client,
    sendEmail: 1,
    details: details,
    payments: [
      {
        paymentTypeId: paymentTypeId,
        amount: Number(venta.total),
        recordDate: emissionDate
      }
    ]
  }
}