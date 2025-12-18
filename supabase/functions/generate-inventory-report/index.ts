import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InventoryReportRequest {
  inventoryId: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { inventoryId } = await req.json() as InventoryReportRequest;
    console.log('Received inventoryId:', inventoryId);

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get inventory data
    const { data: inventory, error: inventoryError } = await supabase
      .from('bin_inventories')
      .select('*')
      .eq('id', inventoryId)
      .single();

    if (inventoryError) {
      console.error('Inventory error:', inventoryError);
      throw new Error(`Error fetching inventory: ${inventoryError.message}`);
    }

    console.log('Found inventory:', inventory);

    // Get inventory changes
    const { data: changes, error: changesError } = await supabase
      .from('inventory_changes')
      .select('*')
      .eq('inventory_id', inventoryId)
      .order('sku');

    if (changesError) {
      console.error('Changes error:', changesError);
      throw new Error(`Error fetching changes: ${changesError.message}`);
    }

    console.log('Found changes:', changes?.length || 0);

    // If no changes found, get all products in the bin to show complete inventory
    let allProducts = [];
    if (!changes || changes.length === 0) {
      const { data: stockData, error: stockError } = await supabase
        .from('stockxbin')
        .select(`
          sku,
          disponibles,
          comprometido,
          en_existencia,
          variants!inner(nombreProducto, variante)
        `)
        .eq('bin', inventory.bin_code);

      if (!stockError && stockData) {
        allProducts = stockData.map(stock => ({
          sku: stock.sku,
          nombre_producto: stock.variants?.nombreProducto || 'Producto sin nombre',
          variante: stock.variants?.variante || null,
          previous_quantity: stock.disponibles + stock.comprometido,
          new_quantity: stock.disponibles + stock.comprometido,
          difference: 0,
          change_type: 'no_change'
        }));
      }
    }

    // Use changes if available, otherwise use all products with no change
    const reportData = changes && changes.length > 0 ? changes : allProducts;
    
    // Generate HTML content for the report
    const htmlContent = generateReportHTML(inventory, reportData);
    
    // Save report URL to database
    const reportDate = inventory.started_at.split('T')[0];
    const filename = `inventario_${inventory.bin_code}_${reportDate}.html`;
    
    // Update inventory with report URL (this would be the URL where the report is stored)
    const reportUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-inventory-report`;
    
    await supabase
      .from('bin_inventories')
      .update({ report_url: reportUrl })
      .eq('id', inventoryId);

    return new Response(htmlContent, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`
      },
    });

  } catch (error) {
    console.error('Error generating inventory report:', error);
    return new Response(
      JSON.stringify({ error: 'Error generating inventory report', details: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

function generateReportHTML(inventory: any, changes: any[]): string {
  const startDate = new Date(inventory.started_at).toLocaleString('es-ES');
  const endDate = inventory.finished_at ? new Date(inventory.finished_at).toLocaleString('es-ES') : 'En proceso';
  
  const increasesCount = changes.filter(c => c.difference > 0).length;
  const decreasesCount = changes.filter(c => c.difference < 0).length;
  const noChangeCount = changes.filter(c => c.difference === 0).length;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Reporte de Inventario - Bin ${inventory.bin_code}</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          margin: 20px; 
          font-size: 12px;
        }
        .header { 
          text-align: center; 
          border-bottom: 2px solid #333; 
          padding-bottom: 10px; 
          margin-bottom: 20px;
        }
        .info-section { 
          margin-bottom: 20px;
        }
        .info-row { 
          display: flex; 
          justify-content: space-between; 
          margin-bottom: 5px;
        }
        table { 
          width: 100%; 
          border-collapse: collapse; 
          margin-top: 10px;
        }
        th, td { 
          border: 1px solid #ddd; 
          padding: 8px; 
          text-align: left;
        }
        th { 
          background-color: #f2f2f2;
        }
        .increase { color: #22c55e; }
        .decrease { color: #ef4444; }
        .no-change { color: #6b7280; }
        .summary {
          background-color: #f8f9fa;
          padding: 10px;
          border-radius: 5px;
          margin-top: 20px;
        }
        .footer {
          margin-top: 30px;
          text-align: center;
          font-size: 10px;
          color: #666;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>REPORTE DE INVENTARIO</h1>
        <h2>Bin: ${inventory.bin_code}</h2>
      </div>

      <div class="info-section">
        <div class="info-row">
          <strong>Iniciado por:</strong> ${inventory.started_by_name}
        </div>
        <div class="info-row">
          <strong>Fecha de inicio:</strong> ${startDate}
        </div>
        ${inventory.finished_by_name ? `
        <div class="info-row">
          <strong>Finalizado por:</strong> ${inventory.finished_by_name}
        </div>
        <div class="info-row">
          <strong>Fecha de finalización:</strong> ${endDate}
        </div>` : ''}
        ${inventory.notes ? `
        <div class="info-row">
          <strong>Notas:</strong> ${inventory.notes}
        </div>` : ''}
      </div>

      <div class="summary">
        <h3>Resumen del Inventario</h3>
        <div class="info-row">
          <strong>Total de productos verificados:</strong> ${changes.length}
        </div>
        ${changes.length > 0 ? `
        <div class="info-row">
          <strong>Incrementos:</strong> <span class="increase">${increasesCount}</span>
        </div>
        <div class="info-row">
          <strong>Decrementos:</strong> <span class="decrease">${decreasesCount}</span>
        </div>
        <div class="info-row">
          <strong>Sin cambios:</strong> <span class="no-change">${noChangeCount}</span>
        </div>
        ` : `
        <div class="info-row">
          <strong>Estado:</strong> <span class="no-change">Inventario sin cambios - Cantidades exactas</span>
        </div>
        `}
      </div>

      <h3>${changes.length > 0 && changes.some(c => c.difference !== 0) ? 'Detalle de Cambios' : 'Productos Verificados'}</h3>
      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Producto</th>
            <th>Variante</th>
            <th>Cantidad ${changes.length > 0 && changes.some(c => c.difference !== 0) ? 'Anterior' : 'Verificada'}</th>
            ${changes.length > 0 && changes.some(c => c.difference !== 0) ? '<th>Cantidad Nueva</th><th>Diferencia</th>' : ''}
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          ${changes.map(change => `
            <tr>
              <td>${change.sku}</td>
              <td>${change.nombre_producto}</td>
              <td>${change.variante || '-'}</td>
              <td>${change.previous_quantity}</td>
              ${changes.some(c => c.difference !== 0) ? `
                <td>${change.new_quantity}</td>
                <td class="${change.difference > 0 ? 'increase' : change.difference < 0 ? 'decrease' : 'no-change'}">
                  ${change.difference > 0 ? '+' : ''}${change.difference}
                </td>
              ` : ''}
              <td class="${change.difference > 0 ? 'increase' : change.difference < 0 ? 'decrease' : 'no-change'}">
                ${change.change_type === 'increase' ? 'Incremento' : change.change_type === 'decrease' ? 'Decremento' : 'Verificado - Sin cambio'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="footer">
        <p>Reporte generado el ${new Date().toLocaleString('es-ES')}</p>
        <p>Sistema de Gestión de Inventarios</p>
      </div>
    </body>
    </html>
  `;
}

// Note: Removed the generatePDF function as we're now returning HTML directly
// In a production environment, you could integrate with services like:
// - Puppeteer for server-side PDF generation
// - jsPDF for client-side PDF generation  
// - External APIs like HTMLtoPDF services