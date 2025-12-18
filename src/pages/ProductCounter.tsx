import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { Download, Trash2, ScanBarcode, RefreshCw, History, FileText, ShoppingCart, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { audioService } from '@/lib/audioService';

interface ProductCount {
  sku: string;
  cantidad: number;
}

interface ImportResult {
  imported: Array<{
    sku: string;
    cantidad: number;
    nombre: string;
    precio: number;
    valor_unitario: number;
  }>;
  notAvailable: Array<{
    sku: string;
    cantidad: number;
    requested: number;
    available: number;
    reason: string;
  }>;
}

export default function ProductCounter() {
  const [products, setProducts] = useState<Map<string, number>>(new Map());
  const [lastScannedSku, setLastScannedSku] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [countName, setCountName] = useState('');
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isProcessingImport, setIsProcessingImport] = useState(false);
  const [scannerMode, setScannerMode] = useState(false);
  const { toast } = useToast();
  const { profile } = useAuth();
  const navigate = useNavigate();

  // Play beep sound on successful scan
  const playSuccessBeep = () => {
    audioService.playSuccessBeep();
  };

  // Fetch user's previous counts
  const { data: previousCounts, refetch: refetchCounts } = useQuery({
    queryKey: ['conteo-productos', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conteo_productos')
        .select('*')
        .eq('created_by', profile?.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data;
    },
    enabled: !!profile?.id
  });

  const handleScan = (code: string) => {
    const sku = code.trim().toUpperCase();
    
    if (!sku) {
      toast({
        title: "Código inválido",
        description: "El código escaneado está vacío",
        variant: "destructive",
      });
      return;
    }

    setProducts(prev => {
      const newMap = new Map(prev);
      const currentCount = newMap.get(sku) || 0;
      newMap.set(sku, currentCount + 1);
      return newMap;
    });

    setLastScannedSku(sku);
    setTimeout(() => setLastScannedSku(null), 2000);

    // Play success beep
    playSuccessBeep();

    toast({
      title: "Producto escaneado",
      description: `SKU: ${sku} - Cantidad: ${(products.get(sku) || 0) + 1}`,
    });
  };

  const generateCSV = async () => {
    if (products.size === 0) {
      toast({
        title: "Sin datos",
        description: "No hay productos para exportar",
        variant: "destructive",
      });
      return;
    }

    if (!countName.trim()) {
      toast({
        title: "Falta nombre",
        description: "Por favor ingresa un nombre para este conteo",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);

    try {
      const productsList = Array.from(products.entries()).map(([sku, cantidad]) => ({ sku, cantidad }));
      
      // Save to database
      const { data: conteoData, error: conteoError } = await supabase
        .from('conteo_productos')
        .insert({
          nombre: countName.trim(),
          created_by: profile?.id,
          created_by_name: profile?.full_name || profile?.email || 'Usuario',
          total_productos: productsList.length,
          total_unidades: productsList.reduce((sum, p) => sum + p.cantidad, 0)
        })
        .select()
        .single();

      if (conteoError) throw conteoError;

      // Save details
      const details = productsList.map(p => ({
        conteo_id: conteoData.id,
        sku: p.sku,
        cantidad: p.cantidad
      }));

      const { error: detailsError } = await supabase
        .from('conteo_productos_detalle')
        .insert(details);

      if (detailsError) throw detailsError;

      // Create CSV content
      const headers = ['SKU', 'Cantidad'];
      const rows = productsList.map(p => [p.sku, p.cantidad.toString()]);
      
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');

      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const fileName = `${countName.trim().replace(/[^a-z0-9]/gi, '_')}_${timestamp}.csv`;
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Conteo guardado",
        description: `Se guardó "${countName}" con ${productsList.length} productos`,
      });

      // Clear the counter after successful save
      setProducts(new Map());
      setLastScannedSku(null);
      setCountName('');
      refetchCounts();
    } catch (error) {
      console.error('Error saving count:', error);
      toast({
        title: "Error",
        description: "No se pudo guardar el conteo en la base de datos",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const downloadPreviousCount = async (conteoId: string, nombre: string) => {
    try {
      // Fetch details for this count
      const { data: details, error } = await supabase
        .from('conteo_productos_detalle')
        .select('sku, cantidad')
        .eq('conteo_id', conteoId)
        .order('sku');

      if (error) throw error;

      // Create CSV content
      const headers = ['SKU', 'Cantidad'];
      const rows = details.map(d => [d.sku, d.cantidad.toString()]);
      
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');

      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      const fileName = `${nombre.replace(/[^a-z0-9]/gi, '_')}.csv`;
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "CSV descargado",
        description: `Se descargó "${nombre}"`,
      });
    } catch (error) {
      console.error('Error downloading count:', error);
      toast({
        title: "Error",
        description: "No se pudo descargar el conteo",
        variant: "destructive",
      });
    }
  };

  const clearAll = () => {
    setProducts(new Map());
    setLastScannedSku(null);
    toast({
      title: "Contador reiniciado",
      description: "Se eliminaron todos los productos",
    });
  };

  const removeProduct = (sku: string) => {
    setProducts(prev => {
      const newMap = new Map(prev);
      newMap.delete(sku);
      return newMap;
    });
    toast({
      title: "Producto eliminado",
      description: `SKU: ${sku} eliminado del conteo`,
    });
  };

  const createSaleFromCount = async (conteoId: string) => {
    setIsProcessingImport(true);
    
    try {
      // Fetch count details
      const { data: details, error: detailsError } = await supabase
        .from('conteo_productos_detalle')
        .select('sku, cantidad')
        .eq('conteo_id', conteoId);

      if (detailsError) throw detailsError;
      if (!details || details.length === 0) {
        toast({
          title: "Sin productos",
          description: "Este conteo no tiene productos",
          variant: "destructive",
        });
        setIsProcessingImport(false);
        return;
      }

      // Get stock and pricing info for all products
      const skus = details.map(d => d.sku);
      
      const [stockRes, variantsRes] = await Promise.all([
        supabase
          .from('stock_totals')
          .select('sku, total_disponible')
          .in('sku', skus),
        supabase
          .from('variants')
          .select('sku, nombreProducto, variante, lista_x_12, variant_value_12')
          .in('sku', skus)
      ]);

      if (stockRes.error) throw stockRes.error;
      if (variantsRes.error) throw variantsRes.error;

      const stockMap = new Map(
        (stockRes.data || []).map(s => [s.sku, s.total_disponible])
      );
      
      const variantsMap = new Map(
        (variantsRes.data || []).map(v => [v.sku, v])
      );

      const imported: ImportResult['imported'] = [];
      const notAvailable: ImportResult['notAvailable'] = [];

      // Process each product
      for (const detail of details) {
        const available = stockMap.get(detail.sku) || 0;
        const variant = variantsMap.get(detail.sku);

        if (!variant) {
          notAvailable.push({
            sku: detail.sku,
            cantidad: 0,
            requested: detail.cantidad,
            available: 0,
            reason: 'Producto no encontrado en el sistema'
          });
          continue;
        }

        if (available < detail.cantidad) {
          notAvailable.push({
            sku: detail.sku,
            cantidad: available,
            requested: detail.cantidad,
            available: available,
            reason: available === 0 
              ? 'Sin stock disponible' 
              : `Solo ${available} de ${detail.cantidad} disponibles`
          });
          
          // Import available quantity if any
          if (available > 0) {
            const precioUnitario = variant.lista_x_12 || 0;
            const valorUnitario = variant.variant_value_12 || (precioUnitario / 1.18);
            
            imported.push({
              sku: detail.sku,
              cantidad: available,
              nombre: variant.nombreProducto + (variant.variante ? ` - ${variant.variante}` : ''),
              precio: precioUnitario,
              valor_unitario: valorUnitario
            });
          }
        } else {
          // Full quantity available
          const precioUnitario = variant.lista_x_12 || 0;
          const valorUnitario = variant.variant_value_12 || (precioUnitario / 1.18);
          
          imported.push({
            sku: detail.sku,
            cantidad: detail.cantidad,
            nombre: variant.nombreProducto + (variant.variante ? ` - ${variant.variante}` : ''),
            precio: precioUnitario,
            valor_unitario: valorUnitario
          });
        }
      }

      setImportResult({ imported, notAvailable });
      setImportDialogOpen(true);
    } catch (error) {
      console.error('Error processing count for sale:', error);
      toast({
        title: "Error",
        description: "No se pudo procesar el conteo",
        variant: "destructive",
      });
    } finally {
      setIsProcessingImport(false);
    }
  };

  const confirmImportToSale = () => {
    if (!importResult || importResult.imported.length === 0) {
      toast({
        title: "Sin productos",
        description: "No hay productos disponibles para importar",
        variant: "destructive",
      });
      return;
    }

    // Navigate to crear venta with imported products
    navigate('/crear-venta', {
      state: {
        importedProducts: importResult.imported
      }
    });
  };

  const productsList = Array.from(products.entries()).map(([sku, cantidad]) => ({
    sku,
    cantidad
  }));

  const totalProducts = Array.from(products.values()).reduce((sum, count) => sum + count, 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <ScanBarcode className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Contador de Productos</h1>
          <p className="text-muted-foreground">
            Escanea productos para contarlos y genera un reporte en CSV
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scanner Section */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ScanBarcode size={20} />
                    Escanear Productos
                  </CardTitle>
                  <CardDescription>
                    Escanea códigos de barras para contarlos
                  </CardDescription>
                </div>
                {lastScannedSku && (
                  <Badge variant="default" className="animate-in fade-in">
                    ✓ {lastScannedSku}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {scannerMode ? (
                <div className="space-y-3">
                  <Badge variant="default" className="w-full justify-center py-2">
                    Modo Escáner Activo
                  </Badge>
                  <BarcodeScanner
                    onScan={handleScan}
                    placeholder="Escanee el código de barras del producto..."
                  />
                  <p className="text-sm text-muted-foreground text-center">
                    Escanee el código de barras o ingrese el SKU manualmente y presione Enter
                  </p>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <ScanBarcode size={48} className="mx-auto mb-4 opacity-50" />
                  <p className="text-sm font-medium mb-2">Modo escáner desactivado</p>
                  <p className="text-xs">Activa el modo escáner desde el botón en "Conteos Anteriores" para comenzar</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Products Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Productos Escaneados</CardTitle>
                  <CardDescription>
                    {productsList.length} productos únicos - {totalProducts} unidades totales
                  </CardDescription>
                </div>
                {productsList.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearAll}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw size={16} />
                    Limpiar Todo
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {productsList.length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">#</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Cantidad</TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productsList.map((product, index) => (
                        <TableRow key={product.sku}>
                          <TableCell className="font-medium">{index + 1}</TableCell>
                          <TableCell className="font-mono">{product.sku}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary">{product.cantidad}</Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeProduct(product.sku)}
                            >
                              <Trash2 size={16} className="text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <ScanBarcode size={48} className="mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No hay productos escaneados</p>
                  <p className="text-sm">Comienza a escanear códigos para agregarlos al conteo</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Summary Section */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Guardar Conteo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="countName">Nombre del Conteo *</Label>
                <Input
                  id="countName"
                  placeholder="Ej: Conteo Mensual Enero"
                  value={countName}
                  onChange={(e) => setCountName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Productos únicos:</span>
                  <span className="text-2xl font-bold">{productsList.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total unidades:</span>
                  <span className="text-2xl font-bold">{totalProducts}</span>
                </div>
              </div>

              <Button
                onClick={generateCSV}
                className="w-full"
                size="lg"
                disabled={productsList.length === 0 || isSaving || !countName.trim()}
              >
                <Download size={20} className="mr-2" />
                {isSaving ? 'Guardando...' : 'Guardar y Descargar CSV'}
              </Button>

              <div className="pt-4 border-t">
                <h4 className="text-sm font-medium mb-2">Formato del CSV:</h4>
                <div className="bg-muted p-3 rounded-md text-xs font-mono">
                  <div>SKU,Cantidad</div>
                  <div className="text-muted-foreground">ABC123,5</div>
                  <div className="text-muted-foreground">XYZ789,3</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Previous Counts */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <History size={20} />
                    Conteos Anteriores
                  </CardTitle>
                  <CardDescription>
                    Últimos 10 conteos realizados
                  </CardDescription>
                </div>
                <Button
                  variant={scannerMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => setScannerMode(!scannerMode)}
                  className="flex items-center gap-2"
                >
                  <ScanBarcode size={16} />
                  {scannerMode ? 'Finalizar Escáner' : 'Modo Escáner'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {previousCounts && previousCounts.length > 0 ? (
                <div className="space-y-2">
                  {previousCounts.map((count) => (
                    <div
                      key={count.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{count.nombre}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(count.created_at).toLocaleDateString('es-ES', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {count.total_productos} productos • {count.total_unidades} unidades
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => createSaleFromCount(count.id)}
                          disabled={isProcessingImport}
                          title="Crear venta desde este conteo"
                        >
                          <ShoppingCart size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => downloadPreviousCount(count.id, count.nombre)}
                          title="Descargar CSV"
                        >
                          <Download size={16} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText size={48} className="mx-auto mb-4 opacity-50" />
                  <p>No hay conteos anteriores</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Import Result Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Crear Venta desde Conteo
            </DialogTitle>
            <DialogDescription>
              Revisa los productos que se importarán a la venta
            </DialogDescription>
          </DialogHeader>

          {importResult && (
            <div className="space-y-4">
              {/* Successfully imported products */}
              {importResult.imported.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Badge variant="default">{importResult.imported.length}</Badge>
                    Productos disponibles para importar
                  </h3>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>SKU</TableHead>
                          <TableHead>Producto</TableHead>
                          <TableHead className="text-right">Cantidad</TableHead>
                          <TableHead className="text-right">Precio Unit.</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importResult.imported.map((product) => (
                          <TableRow key={product.sku}>
                            <TableCell className="font-mono text-xs">{product.sku}</TableCell>
                            <TableCell className="text-sm">{product.nombre}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary">{product.cantidad}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              S/ {product.precio.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Products not available */}
              {importResult.notAvailable.length > 0 && (
                <div className="space-y-2">
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Productos no disponibles</AlertTitle>
                    <AlertDescription>
                      Los siguientes productos no pudieron ser importados completamente
                    </AlertDescription>
                  </Alert>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>SKU</TableHead>
                          <TableHead>Solicitado</TableHead>
                          <TableHead>Disponible</TableHead>
                          <TableHead>Motivo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importResult.notAvailable.map((product) => (
                          <TableRow key={product.sku}>
                            <TableCell className="font-mono text-xs">{product.sku}</TableCell>
                            <TableCell>{product.requested}</TableCell>
                            <TableCell>
                              <Badge variant={product.available > 0 ? "secondary" : "destructive"}>
                                {product.available}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {product.reason}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setImportDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={confirmImportToSale}
                  disabled={!importResult.imported.length}
                >
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  Continuar a Crear Venta ({importResult.imported.length})
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
