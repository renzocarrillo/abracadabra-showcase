import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Plus, Trash2, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';

interface Product {
  id: string;
  sku: string;
  nombreProducto: string;
  variante: string | null;
}

interface SelectedProduct extends Product {
  quantity: number;
  cost: number;
}

interface Bin {
  id: string;
  bin_code: string;
}

export default function StockEntry() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasPermission, isAdmin, loading } = usePermissions();

  // Check permissions
  if (!loading && !hasPermission('stock_entry') && !hasPermission('manage_stock') && !hasPermission('manage_inventory') && !isAdmin()) {
    return <Navigate to="/dashboard" replace />;
  }
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedBin, setSelectedBin] = useState('');
  const [internalIdentifier, setInternalIdentifier] = useState('');

  // Fetch products for search suggestions
  const { data: products = [] } = useQuery({
    queryKey: ['products', searchTerm],
    queryFn: async () => {
      if (!searchTerm.trim()) return [];
      
      const { data, error } = await supabase
        .from('variants')
        .select('id, sku, nombreProducto, variante')
        .or(`sku.ilike.%${searchTerm}%,nombreProducto.ilike.%${searchTerm}%`)
        .order('sku')
        .limit(20);

      if (error) throw error;
      
      // Prioritize exact matches and shorter SKUs
      const sortedData = (data as Product[]).sort((a, b) => {
        const aExact = a.sku.toLowerCase() === searchTerm.toLowerCase();
        const bExact = b.sku.toLowerCase() === searchTerm.toLowerCase();
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        
        // Then by length (shorter = more specific)
        const lengthDiff = a.sku.length - b.sku.length;
        if (lengthDiff !== 0) return lengthDiff;
        
        return a.sku.localeCompare(b.sku);
      });
      
      return sortedData.slice(0, 10);
    },
    enabled: searchTerm.trim().length > 0,
  });

  // Fetch bins
  const { data: bins = [] } = useQuery({
    queryKey: ['bins'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bins')
        .select('id, bin_code')
        .order('bin_code');

      if (error) throw error;
      
      // Sort bins to show "Transito" first
      const sortedBins = data?.sort((a, b) => {
        if (a.bin_code.toLowerCase() === 'transito') return -1;
        if (b.bin_code.toLowerCase() === 'transito') return 1;
        return a.bin_code.localeCompare(b.bin_code);
      }) || [];
      
      return sortedBins as Bin[];
    },
  });

  // Mutation to save stock entries
  const saveStockMutation = useMutation({
    mutationFn: async ({ entries, bin }: { entries: SelectedProduct[], bin: string }) => {
      // Get current session token
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error('No hay sesión activa');
      }

      // Get next document number
      const { data: documentNumberData, error: docError } = await supabase
        .rpc('get_next_document_number');
      
      if (docError) throw docError;

      // Get variant costs and BSale IDs
      const skus = entries.map(e => e.sku);
      const { data: variantData, error: variantError } = await supabase
        .from('variants')
        .select('sku, costo, id, idProductoBsale')
        .in('sku', skus);

      if (variantError) throw variantError;

      // Prepare BSale API request using edited costs
      const details = entries.map(entry => {
        return {
          quantity: entry.quantity,
          code: entry.sku,
          cost: entry.cost
        };
      });

      console.log('BSale request details:', details);

      const bsaleBody = {
        document: "Guía",
        officeId: 17,
        documentNumber: documentNumberData.toString(),
        note: "Ingreso de stock desde sistema",
        bin: bin,
        details: details,
        internal_identifier: internalIdentifier || null
      };

      // Llamar a Edge Function (incluye auth automáticamente)
      const { data: fnData, error: fnError } = await supabase.functions.invoke('create-stock-reception', {
        body: bsaleBody,
      });

      if (fnError || !fnData?.success) {
        throw new Error(fnData?.error || 'Error al crear recepción de stock');
      }

      const bsaleResult = fnData?.data ?? null;
      const migrationMode = fnData?.migration_mode === true;

      return { bsaleResult };
    },
    onSuccess: () => {
      toast({
        title: "Stock ingresado exitosamente",
        description: "Los productos han sido agregados al inventario",
      });
      setSelectedProducts([]);
      setSearchTerm('');
      setSelectedBin('');
      setInternalIdentifier('');
    },
    onError: (error) => {
      console.error('Error saving stock:', error);
      toast({
        title: "Error al ingresar stock",
        description: "Hubo un problema al guardar la información",
        variant: "destructive",
      });
    },
  });

  const handleProductSelect = async (product: Product) => {
    const isAlreadySelected = selectedProducts.some(p => p.sku === product.sku);
    
    if (!isAlreadySelected) {
      // Get cost from variants table
      const { data: variantData } = await supabase
        .from('variants')
        .select('costo')
        .eq('sku', product.sku)
        .single();
      
      const cost = parseFloat(variantData?.costo?.toString() || '0');
      
      setSelectedProducts(prev => [...prev, {
        ...product,
        quantity: 1,
        cost: cost
      }]);
    }
    
    setSearchTerm('');
    setShowSuggestions(false);
  };

  const handleQuantityChange = (sku: string, quantity: number) => {
    setSelectedProducts(prev =>
      prev.map(product =>
        product.sku === sku
          ? { ...product, quantity: Math.max(0, quantity) }
          : product
      )
    );
  };

  const handleCostChange = (sku: string, cost: number) => {
    setSelectedProducts(prev =>
      prev.map(product =>
        product.sku === sku
          ? { ...product, cost: Math.max(0, cost) }
          : product
      )
    );
  };


  const handleRemoveProduct = (sku: string) => {
    setSelectedProducts(prev => prev.filter(product => product.sku !== sku));
  };

  const handleSave = () => {
    const validEntries = selectedProducts.filter(p => p.quantity > 0);
    
    if (validEntries.length === 0) {
      toast({
        title: "Error de validación",
        description: "Debe seleccionar al menos un producto con cantidad válida",
        variant: "destructive",
      });
      return;
    }

    if (!selectedBin) {
      toast({
        title: "Error de validación",
        description: "Debe seleccionar una ubicación para todos los productos",
        variant: "destructive",
      });
      return;
    }

    if (validEntries.length !== selectedProducts.length) {
      toast({
        title: "Error de validación",
        description: "Todos los productos deben tener cantidad mayor a 0",
        variant: "destructive",
      });
      return;
    }

    saveStockMutation.mutate({ entries: validEntries, bin: selectedBin });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          onClick={() => navigate('/products')}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Productos
        </Button>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Ingreso de Stock</h2>
            <p className="text-muted-foreground">Agregar productos al inventario</p>
          </div>
          <Button
            onClick={() => navigate('/productos/importar')}
            variant="outline"
            className="flex items-center gap-2"
          >
            Importar
          </Button>
        </div>

        <Card className="p-6 bg-card border-border">
          <div className="space-y-4">
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Buscar productos por SKU o nombre..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  className="pl-10"
                />
              </div>
              
              {showSuggestions && products.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto">
                  {products.map((product) => (
                    <div
                      key={product.id}
                      className="p-3 hover:bg-accent cursor-pointer border-b border-border last:border-b-0"
                      onClick={() => handleProductSelect(product)}
                    >
                      <div className="font-medium text-foreground">{product.nombreProducto}</div>
                      <div className="text-sm text-muted-foreground">
                        SKU: {product.sku}
                        {product.variante && ` | Variante: ${product.variante}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedProducts.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-foreground">Productos Seleccionados</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Ubicación para todos:</span>
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
                </div>
                
                  <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Cantidad</TableHead>
                      <TableHead>Costo Unitario</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedProducts.map((product) => (
                      <TableRow key={product.sku}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{product.nombreProducto}</div>
                            {product.variante && (
                              <div className="text-sm text-muted-foreground">{product.variante}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{product.sku}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            value={product.quantity}
                            onChange={(e) => handleQuantityChange(product.sku, parseInt(e.target.value) || 0)}
                            className="w-20"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={product.cost}
                            onChange={(e) => handleCostChange(product.sku, parseFloat(e.target.value) || 0)}
                            className="w-24"
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveProduct(product.sku)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-foreground mb-1 block">
                      Identificador Interno (Opcional)
                    </label>
                    <Input
                      placeholder="Ej: FAC-2024-001, PROV-123, OC-456..."
                      value={internalIdentifier}
                      onChange={(e) => setInternalIdentifier(e.target.value)}
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Para referencia interna. No se envía a BSale.
                    </p>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={handleSave}
                    disabled={saveStockMutation.isPending || selectedProducts.length === 0}
                    className="flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    {saveStockMutation.isPending ? 'Guardando...' : 'Guardar Stock'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}