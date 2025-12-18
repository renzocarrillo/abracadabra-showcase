import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Download, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePermissions } from '@/hooks/usePermissions';

interface ParsedProduct {
  sku: string;
  quantity: number;
  exists?: boolean;
  productInfo?: {
    id: string;
    nombreProducto: string;
    variante: string | null;
  };
  availableStock?: number;
  hasStockError?: boolean;
}

interface Bin {
  id: string;
  bin_code: string;
}

interface StockInfo {
  sku: string;
  disponibles: number;
}

export default function ImportStockWithdrawal() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasPermission, isAdmin, loading: permissionsLoading } = usePermissions();
  const [excelData, setExcelData] = useState('');
  const [parsedProducts, setParsedProducts] = useState<ParsedProduct[]>([]);
  const [selectedBin, setSelectedBin] = useState('');
  const [validProducts, setValidProducts] = useState<ParsedProduct[]>([]);
  const [invalidProducts, setInvalidProducts] = useState<ParsedProduct[]>([]);
  const [internalIdentifier, setInternalIdentifier] = useState('');

  // Check permissions
  const canManageStock = hasPermission('manage_stock') || isAdmin();


  // Fetch bins
  const { data: bins = [] } = useQuery({
    queryKey: ['bins'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bins')
        .select('id, bin_code')
        .order('bin_code');

      if (error) throw error;
      return data as Bin[];
    },
  });

  // Mutation to withdraw stock
  const withdrawStockMutation = useMutation({
    mutationFn: async ({ entries, bin, internalId }: { entries: ParsedProduct[], bin: string, internalId: string }) => {
      // First, call the BSale API through our edge function
      const { data, error } = await supabase.functions.invoke('create-stock-consumption', {
        body: {
          products: entries.map(entry => ({
            sku: entry.sku,
            quantity: entry.quantity
          })),
          note: `Retiro masivo desde Excel - Bin: ${bin}`,
          bin: bin,
          internal_identifier: internalId || null
        }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to create consumption in BSale');
      }

      // Stock is updated inside the edge function with service role; no client-side updates to avoid RLS issues.
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Stock retirado exitosamente",
        description: `${validProducts.filter(p => !p.hasStockError).length} variantes han sido retiradas del inventario y registradas en BSale`,
      });
      setExcelData('');
      setParsedProducts([]);
      setValidProducts([]);
      setInvalidProducts([]);
      setSelectedBin('');
      setInternalIdentifier('');
    },
    onError: (error) => {
      console.error('Error withdrawing stock:', error);
      toast({
        title: "Error al retirar stock",
        description: error.message || "Hubo un problema al procesar el retiro",
        variant: "destructive",
      });
    },
  });

  const parseExcelData = async () => {
    if (!excelData.trim()) {
      toast({
        title: "Error",
        description: "Por favor pega los datos de Excel",
        variant: "destructive",
      });
      return;
    }

    if (!selectedBin) {
      toast({
        title: "Error",
        description: "Debe seleccionar una ubicación primero",
        variant: "destructive",
      });
      return;
    }

    const lines = excelData.trim().split('\n');
    const variants: ParsedProduct[] = [];

    for (const line of lines) {
      const columns = line.split('\t'); // Excel copy-paste uses tabs
      if (columns.length >= 2) {
        const sku = columns[0].trim();
        const quantity = parseInt(columns[1].trim());
        
        if (sku && !isNaN(quantity) && quantity > 0) {
          variants.push({
            sku,
            quantity,
          });
        }
      }
    }

    if (variants.length === 0) {
      toast({
        title: "Error",
        description: "No se encontraron variantes válidas. Asegúrate de que los datos tengan formato: SKU [TAB] Cantidad",
        variant: "destructive",
      });
      return;
    }

    // Verify variants exist in database
    const skus = variants.map(p => p.sku);
    const { data: existingVariants, error } = await supabase
      .from('variants')
      .select('id, sku, nombreProducto, variante')
      .in('sku', skus);

    if (error) {
      toast({
        title: "Error",
        description: "Error al verificar variantes",
        variant: "destructive",
      });
      return;
    }

    // Get stock info for the selected bin
    const { data: stockInfo, error: stockError } = await supabase
      .from('stockxbin')
      .select('sku, disponibles')
      .eq('bin', selectedBin)
      .in('sku', skus);

    if (stockError) {
      toast({
        title: "Error",
        description: "Error al verificar stock disponible",
        variant: "destructive",
      });
      return;
    }

    const valid: ParsedProduct[] = [];
    const invalid: ParsedProduct[] = [];

    variants.forEach(variant => {
      const existingVariant = existingVariants?.find(p => p.sku === variant.sku);
      const stockForVariant = stockInfo?.find(s => s.sku === variant.sku);
      const availableStock = stockForVariant?.disponibles || 0;
      const hasStockError = variant.quantity > availableStock;

      if (existingVariant) {
        valid.push({
          ...variant,
          exists: true,
          productInfo: existingVariant,
          availableStock,
          hasStockError,
        });
      } else {
        invalid.push({
          ...variant,
          exists: false,
        });
      }
    });

    setParsedProducts(variants);
    setValidProducts(valid);
    setInvalidProducts(invalid);
  };

  const handleSave = () => {
    const validEntriesWithoutErrors = validProducts.filter(p => !p.hasStockError);
    
    if (validEntriesWithoutErrors.length === 0) {
      toast({
        title: "Error",
        description: "No hay variantes válidas para retirar sin errores de stock",
        variant: "destructive",
      });
      return;
    }

    if (!selectedBin) {
      toast({
        title: "Error",
        description: "Debe seleccionar una ubicación",
        variant: "destructive",
      });
      return;
    }

    withdrawStockMutation.mutate({ entries: validEntriesWithoutErrors, bin: selectedBin, internalId: internalIdentifier });
  };

  const hasStockErrors = validProducts.some(p => p.hasStockError);
  const validProductsWithoutErrors = validProducts.filter(p => !p.hasStockError);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {permissionsLoading ? (
        <div className="py-20 text-center text-muted-foreground">Cargando permisos...</div>
      ) : !canManageStock ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            No tienes permisos para realizar retiros de stock masivos. Esta función está disponible solo para Administradores y Supervisores.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => navigate('/productos/retirar')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver a Retiro de Stock
            </Button>
          </div>

          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-2">Importar Retiro de Stock desde Excel</h2>
              <p className="text-muted-foreground">Copia y pega los datos desde Excel con columnas SKU y Cantidad a Retirar</p>
            </div>

            <Card className="p-6 bg-card border-border">
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <span className="text-sm text-muted-foreground">Seleccionar ubicación:</span>
                    <Select value={selectedBin} onValueChange={setSelectedBin}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Seleccionar ubicación" />
                      </SelectTrigger>
                      <SelectContent>
                        {bins.map((bin) => (
                          <SelectItem key={bin.id} value={bin.bin_code}>
                            {bin.bin_code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Identificador Interno (Opcional)
                  </label>
                  <Input
                    placeholder="Ej: OP-001, Retiro-Marzo-2024, etc."
                    value={internalIdentifier}
                    onChange={(e) => setInternalIdentifier(e.target.value)}
                  />
                </div>

                {selectedBin && (
                  <>
                    <div>
                      <h3 className="text-lg font-medium text-foreground mb-2">Copiar desde Excel</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Copia el contenido de tu planilla Excel y pégalo en el recuadro de abajo
                      </p>
                      <Textarea
                        placeholder="Pega aquí el contenido que copiaste en Excel"
                        value={excelData}
                        onChange={(e) => setExcelData(e.target.value)}
                        className="min-h-32"
                      />
                    </div>

                    <div className="flex items-center gap-4">
                      <Button
                        onClick={parseExcelData}
                        className="flex items-center gap-2"
                        disabled={!excelData.trim() || !selectedBin}
                      >
                        <Download className="h-4 w-4" />
                        Cargar Retiro
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </Card>

            {invalidProducts.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {invalidProducts.length} variantes no serán procesadas porque no son reconocidas:
                  {invalidProducts.map(p => ` ${p.sku}`).join(',')}
                </AlertDescription>
              </Alert>
            )}

            {hasStockErrors && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Algunos variantes tienen errores de stock (cantidad a retirar mayor que disponible). Solo se procesarán las variantes sin errores.
                </AlertDescription>
              </Alert>
            )}

            {validProducts.length > 0 && (
              <Card className="p-6 bg-card border-border">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium text-foreground">
                      Variantes a Retirar ({validProductsWithoutErrors.length} de {validProducts.length})
                    </h3>
                    <Button
                      onClick={handleSave}
                      disabled={withdrawStockMutation.isPending || validProductsWithoutErrors.length === 0}
                      className="flex items-center gap-2"
                    >
                      {withdrawStockMutation.isPending ? 'Guardando...' : 'Retirar Stock'}
                    </Button>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>Variante</TableHead>
                        <TableHead>Disponible</TableHead>
                        <TableHead>Cantidad a Retirar</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validProducts.map((variant, index) => (
                        <TableRow key={index} className={variant.hasStockError ? 'bg-destructive/10' : ''}>
                          <TableCell className="font-mono">{variant.sku}</TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{variant.productInfo?.nombreProducto}</div>
                              {variant.productInfo?.variante && (
                                <div className="text-sm text-muted-foreground">{variant.productInfo.variante}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono">{variant.availableStock}</TableCell>
                          <TableCell className="font-mono">{variant.quantity}</TableCell>
                          <TableCell>
                            {variant.hasStockError ? (
                              <div className="flex items-center gap-1 text-destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <span className="text-sm">Stock insuficiente</span>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">✓ Válido</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}