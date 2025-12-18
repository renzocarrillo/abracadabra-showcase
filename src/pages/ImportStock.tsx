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
import { ArrowLeft, Upload, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';

interface ParsedProduct {
  sku: string;
  quantity: number;
  cost?: number;
  exists?: boolean;
  productInfo?: {
    id: string;
    nombreProducto: string;
    variante: string | null;
  };
}

interface Bin {
  id: string;
  bin_code: string;
}

export default function ImportStock() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuth();
  const { hasPermission, isAdmin } = usePermissions();
  const [excelData, setExcelData] = useState('');
  const [parsedProducts, setParsedProducts] = useState<ParsedProduct[]>([]);
  const [selectedBin, setSelectedBin] = useState('');
  const [validProducts, setValidProducts] = useState<ParsedProduct[]>([]);
  const [invalidProducts, setInvalidProducts] = useState<ParsedProduct[]>([]);
  const [internalIdentifier, setInternalIdentifier] = useState('');

  // Check permissions - only admin and supervisor can import stock
  if (!isAdmin() && !hasPermission('manage_inventory') && profile?.role !== 'admin') {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            No tienes permisos para importar stock. Solo administradores y supervisores pueden realizar esta acción.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

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

  // Mutation to save stock entries
  const saveStockMutation = useMutation({
    mutationFn: async ({ entries, bin, internalId }: { entries: ParsedProduct[], bin: string, internalId: string }) => {
      // Get current session token
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error('No hay sesión activa');
      }

      // Get next document number
      const { data: documentNumberData, error: docError } = await supabase
        .rpc('get_next_document_number');
      
      if (docError) throw docError;

      // Prepare BSale API request using edited costs
      const details = entries.map(entry => {
        return {
          quantity: entry.quantity,
          code: entry.sku,
          cost: entry.cost || 0
        };
      });

      console.log('BSale request details:', details);

      const bsaleBody = {
        document: "Guía",
        officeId: 17,
        documentNumber: documentNumberData.toString(),
        note: "Ingreso masivo desde Excel",
        bin: bin,
        details: details,
        internal_identifier: internalId || null
      };

      // Llamar a Edge Function (incluye auth automáticamente)
      const { data: fnData, error: fnError } = await supabase.functions.invoke('create-stock-reception', {
        body: bsaleBody,
      });

      if (fnError || !fnData?.success) {
        const errorMessage = fnData?.error || 'Error al crear recepción de stock';
        const stockErrors = fnData?.stock_errors || [];
        
        // If BSale succeeded but stock update failed, provide detailed error
        if (fnData?.bsale_success && stockErrors.length > 0) {
          const errorDetails = stockErrors.map((e: any) => `${e.sku}: ${e.error}`).join(', ');
          throw new Error(`${errorMessage}. Detalles: ${errorDetails}`);
        }
        
        throw new Error(errorMessage);
      }

      const bsaleResult = fnData?.data ?? null;
      const migrationMode = fnData?.migration_mode === true;

      return { bsaleResult };
    },
    onSuccess: () => {
      toast({
        title: "Stock importado exitosamente",
        description: `${validProducts.length} variantes han sido agregadas al inventario`,
      });
      setExcelData('');
      setParsedProducts([]);
      setValidProducts([]);
      setInvalidProducts([]);
      setSelectedBin('');
      setInternalIdentifier('');
    },
    onError: (error) => {
      console.error('Error saving stock:', error);
      toast({
        title: "Error al importar stock",
        description: "Hubo un problema al guardar la información",
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

    const lines = excelData.trim().split('\n');
    const variants: ParsedProduct[] = [];

    for (const line of lines) {
      const columns = line.split('\t'); // Excel copy-paste uses tabs
      if (columns.length >= 2) {
        const sku = columns[0].trim();
        const quantity = parseInt(columns[1].trim());
        const cost = columns.length >= 3 ? parseFloat(columns[2].trim()) : undefined;
        
        if (sku && !isNaN(quantity) && quantity > 0) {
          // Validate cost if provided
          if (cost !== undefined && (isNaN(cost) || cost < 0)) {
            toast({
              title: "Error",
              description: `El costo para SKU ${sku} no puede ser negativo`,
              variant: "destructive",
            });
            continue;
          }
          
          variants.push({
            sku,
            quantity,
            cost,
          });
        }
      }
    }

    if (variants.length === 0) {
      toast({
        title: "Error",
        description: "No se encontraron variantes válidas. Formato: SKU [TAB] Cantidad [TAB] Costo (opcional)",
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

    const valid: ParsedProduct[] = [];
    const invalid: ParsedProduct[] = [];

    variants.forEach(variant => {
      const existingVariant = existingVariants?.find(p => p.sku === variant.sku);
      if (existingVariant) {
        valid.push({
          ...variant,
          exists: true,
          productInfo: existingVariant,
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
    if (validProducts.length === 0) {
      toast({
        title: "Error",
        description: "No hay variantes válidas para importar",
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

    saveStockMutation.mutate({ entries: validProducts, bin: selectedBin, internalId: internalIdentifier });
  };

  const updateProductCost = (sku: string, cost: number) => {
    setValidProducts(prev => 
      prev.map(p => p.sku === sku ? { ...p, cost } : p)
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          onClick={() => navigate('/productos/ingreso')}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Ingreso de Stock
        </Button>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Importar Stock desde Excel</h2>
          <p className="text-muted-foreground">Copia y pega los datos desde Excel con columnas SKU, Cantidad y Costo (opcional)</p>
        </div>

        <Card className="p-6 bg-card border-border">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Identificador Interno (Opcional)
              </label>
              <Input
                placeholder="Ej: OP-001, Compra-Marzo-2024, etc."
                value={internalIdentifier}
                onChange={(e) => setInternalIdentifier(e.target.value)}
                className="mb-4"
              />
            </div>

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
                disabled={!excelData.trim()}
              >
                <Upload className="h-4 w-4" />
                Cargar Stock
              </Button>

              {parsedProducts.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Ubicación:</span>
                  <Select value={selectedBin} onValueChange={setSelectedBin}>
                    <SelectTrigger className="w-48">
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
              )}
            </div>
          </div>
        </Card>

        {invalidProducts.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {invalidProducts.length} variantes no serán cargadas porque no son reconocidas:
              {invalidProducts.map(p => ` ${p.sku}`).join(',')}
            </AlertDescription>
          </Alert>
        )}

        {validProducts.length > 0 && (
          <Card className="p-6 bg-card border-border">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-foreground">
                  Variantes a Importar ({validProducts.length})
                </h3>
                <Button
                  onClick={handleSave}
                  disabled={saveStockMutation.isPending || !selectedBin}
                  className="flex items-center gap-2"
                >
                  {saveStockMutation.isPending ? 'Guardando...' : 'Guardar'}
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Variante</TableHead>
                    <TableHead>Cantidad</TableHead>
                    <TableHead>Costo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {validProducts.map((variant, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-mono">{variant.sku}</TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{variant.productInfo?.nombreProducto}</div>
                          {variant.productInfo?.variante && (
                            <div className="text-sm text-muted-foreground">{variant.productInfo.variante}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{variant.quantity}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={variant.cost || ''}
                          onChange={(e) => updateProductCost(variant.sku, parseFloat(e.target.value) || 0)}
                          placeholder="Ingrese costo"
                          step="0.01"
                          min="0"
                          className="w-24"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}