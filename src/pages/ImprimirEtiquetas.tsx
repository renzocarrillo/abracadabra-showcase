import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Printer } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CurrentItem {
  sku_variant: string;
  product_name: string;
  variant_name: string;
  price_base: number;
}

export default function ImprimirEtiquetas() {
  const [skuInput, setSkuInput] = useState('');
  const [qtyInput, setQtyInput] = useState(1);
  const [currentItem, setCurrentItem] = useState<CurrentItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchVariantInfo = async () => {
    const rawSku = skuInput.trim();
    if (!rawSku) {
      toast.error('Por favor ingresa un SKU');
      return;
    }
    
    setIsLoading(true);
    try {
      // Normalize scanner typos
      const normalizedSku = rawSku
        .replace(/·/g, '#')
        .replace(/'/g, '-')
        .trim();
      
      console.log('Buscando SKU:', normalizedSku);
      
      // Query Supabase variants table
      const { data, error } = await supabase
        .from('variants')
        .select('*')
        .eq('sku', normalizedSku)
        .maybeSingle();
      
      if (error) {
        console.error('Error querying Supabase:', error);
        toast.error('Error al consultar la base de datos');
        setCurrentItem(null);
        return;
      }
      
      if (!data) {
        toast.error('SKU no encontrado en el sistema');
        setCurrentItem(null);
        return;
      }
      
      // Map DB row to currentItem structure
      const item: CurrentItem = {
        sku_variant: data.sku,
        product_name: data.nombreProducto,
        variant_name: data.variante || 'Sin variante',
        price_base: Number((data as any).precio_base) || 0
      };
      
      setCurrentItem(item);
      setSkuInput(normalizedSku); // Update input with normalized SKU
      toast.success('Producto encontrado');
      
    } catch (error) {
      console.error('Error fetching variant:', error);
      toast.error('Error al buscar el producto');
      setCurrentItem(null);
    } finally {
      setIsLoading(false);
    }
  };

  const printLabels = () => {
    // Validate currentItem exists
    if (!currentItem) {
      alert("Primero busca un SKU válido");
      return;
    }
    
    // Validate qtyInput is positive
    const qty = parseInt(String(qtyInput), 10);
    if (!qty || qty < 1) {
      alert("Cantidad inválida");
      return;
    }
    
    // Destructure data from currentItem
    const { sku_variant, product_name, variant_name, price_base } = currentItem;
    
    // Build HTML for each label
    let labelsHtml = "";
    for (let i = 0; i < qty; i++) {
      labelsHtml += `
<div class="label">
  <div class="title-line">${product_name} - ${variant_name}</div>

  <div class="barcode-block">
    <img src="https://barcode.tec-it.com/barcode.ashx?data=${encodeURIComponent(sku_variant)}&code=Code128&translate-esc=on&noText=1" />
  </div>

  <div class="price">S/ ${price_base.toFixed(2)}</div>
</div>`;
    }
    
    // Build full printable HTML document
    const fullHtml = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
@page {
  size: 94mm auto;
  margin: 0;
}
body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
}
.sheet {
  box-sizing: border-box;
  width: 94mm;
  padding-top: 0.5mm;
  display: flex;
  flex-wrap: wrap;
  gap: 2mm 2mm;
  justify-content: flex-start;
  align-content: flex-start;
}

.label {
  box-sizing: border-box;
  width: 30mm;
  height: 20mm;
  padding: 2mm;
  border: 1px solid #000;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
}

.title-line {
  font-size: 2.2mm;
  line-height: 2.6mm;
  font-weight: 600;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.barcode-block {
  text-align: center;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.barcode-block img {
  max-width: 100%;
  max-height: 10mm;
  object-fit: contain;
}
.price {
  font-size: 3mm;
  font-weight: 700;
  text-align: right;
  white-space: nowrap;
}
</style>
</head>
<body>
  <div class="sheet">
    ${labelsHtml}
  </div>
</body>
</html>`;
    
    // Open new window and trigger print
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(fullHtml);
      w.document.close();
      
      setTimeout(() => {
        w.focus();
        w.print();
      }, 500);
    } else {
      alert("No se pudo abrir la ventana de impresión. Verifica que los pop-ups estén permitidos.");
    }
  };

  const canPrint = currentItem !== null && qtyInput >= 1;

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-4xl">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Imprimir Etiquetas</h1>
        <p className="text-muted-foreground">
          Escanea o ingresa el SKU para generar etiquetas de productos
        </p>
      </div>

      {/* SKU Input Section */}
      <Card>
        <CardHeader>
          <CardTitle>Buscar Producto</CardTitle>
          <CardDescription>
            Escanea el código de barras o ingresa el SKU manualmente
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="skuInput" className="sr-only">SKU</Label>
              <Input
                id="skuInput"
                type="text"
                placeholder="Ej: 2000006#6"
                value={skuInput}
                onChange={(e) => setSkuInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    fetchVariantInfo();
                  }
                }}
                className="h-12 text-lg"
                autoFocus
              />
            </div>
            <Button 
              onClick={fetchVariantInfo}
              disabled={!skuInput.trim() || isLoading}
              size="lg"
              className="px-6"
            >
              <Search className="mr-2 h-5 w-5" />
              Buscar SKU
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview Card */}
      {currentItem && (
        <Card className="border-2 border-primary">
          <CardHeader>
            <CardTitle>Vista Previa de Etiqueta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4">
              <div>
                <Label className="text-sm text-muted-foreground">Producto</Label>
                <p className="text-xl font-semibold">{currentItem.product_name}</p>
              </div>
              
              <div>
                <Label className="text-sm text-muted-foreground">Variante</Label>
                <p className="text-lg">{currentItem.variant_name}</p>
              </div>
              
              <div>
                <Label className="text-sm text-muted-foreground">Precio</Label>
                <p className="text-2xl font-bold">S/ {currentItem.price_base.toFixed(2)}</p>
              </div>
            </div>

            <div className="border rounded-lg p-6 bg-background space-y-3 flex flex-col items-center">
              <img
                src={`https://barcode.tec-it.com/barcode.ashx?data=${encodeURIComponent(currentItem.sku_variant)}&code=Code128&translate-esc=on`}
                alt={`Código de barras ${currentItem.sku_variant}`}
                className="max-w-full h-auto"
              />
              <p className="text-sm font-mono text-center">{currentItem.sku_variant}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Print Section */}
      <Card>
        <CardHeader>
          <CardTitle>Cantidad e Impresión</CardTitle>
          <CardDescription>
            Selecciona cuántas etiquetas deseas imprimir
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1 max-w-xs">
              <Label htmlFor="qtyInput">Cantidad de etiquetas</Label>
              <Input
                id="qtyInput"
                type="number"
                min="1"
                value={qtyInput}
                onChange={(e) => setQtyInput(parseInt(e.target.value) || 1)}
                className="h-12 text-lg"
              />
            </div>
            
            <Button
              onClick={printLabels}
              disabled={!canPrint}
              size="lg"
              className="px-8"
            >
              <Printer className="mr-2 h-5 w-5" />
              Imprimir Etiquetas
            </Button>
          </div>
          
          {!currentItem && (
            <p className="text-sm text-muted-foreground">
              Primero busca un producto para poder imprimir etiquetas
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
