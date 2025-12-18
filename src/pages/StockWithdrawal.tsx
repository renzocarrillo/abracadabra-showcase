import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Minus, Trash2, Search, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePermissions } from '@/hooks/usePermissions';

interface Product {
  id: string;
  sku: string;
  nombreProducto: string;
  variante: string | null;
}

interface StockInfo {
  sku: string;
  disponibles: number;
  bin: string;
}

interface SelectedProduct extends Product {
  quantity: number;
  availableStock: number;
  selectedBin: string;
}

interface Bin {
  id: string;
  bin_code: string;
}

export default function StockWithdrawal() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasPermission, isAdmin, loading } = usePermissions();

  // Check permissions
  if (!loading && !hasPermission('stock_withdrawal') && !hasPermission('manage_stock') && !hasPermission('manage_inventory') && !isAdmin()) {
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

  // Fetch stock info for selected bin
  const { data: stockInfo = [] } = useQuery({
    queryKey: ['stock-info', selectedBin],
    queryFn: async () => {
      if (!selectedBin) return [];
      
      const { data, error } = await supabase
        .from('stockxbin')
        .select('sku, disponibles, bin')
        .eq('bin', selectedBin)
        .neq('disponibles', 0)
        .order('sku');

      if (error) throw error;
      return data as StockInfo[];
    },
    enabled: !!selectedBin,
  });

  // Mutation to withdraw stock
  const withdrawStockMutation = useMutation({
    mutationFn: async ({ entries, bin }: { entries: SelectedProduct[], bin: string }) => {
      // First, call the BSale API through our edge function
      const { data, error } = await supabase.functions.invoke('create-stock-consumption', {
        body: {
          products: entries.map(entry => ({
            sku: entry.sku,
            quantity: entry.quantity
          })),
          note: null, // Will auto-generate incremental note
          bin: bin, // Add the bin parameter
          internal_identifier: internalIdentifier || null
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
        description: "Los productos han sido retirados del inventario y registrados en BSale",
      });
      setSelectedProducts([]);
      setSearchTerm('');
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

  const handleProductSelect = (product: Product) => {
    if (!selectedBin) {
      toast({
        title: "Selecciona una ubicación",
        description: "Primero debes seleccionar una ubicación para ver el stock disponible",
        variant: "destructive",
      });
      return;
    }

    const isAlreadySelected = selectedProducts.some(p => p.sku === product.sku);
    
    if (!isAlreadySelected) {
      const stockForProduct = stockInfo.find(s => s.sku === product.sku);
      const availableStock = stockForProduct?.disponibles || 0;

      if (availableStock === 0) {
        toast({
          title: "Sin stock disponible",
          description: `No hay stock disponible para ${product.sku} en la ubicación seleccionada`,
          variant: "destructive",
        });
        return;
      }

      setSelectedProducts(prev => [...prev, {
        ...product,
        quantity: 1,
        availableStock,
        selectedBin,
      }]);
    }
    
    setSearchTerm('');
    setShowSuggestions(false);
  };

  const handleQuantityChange = (sku: string, quantity: number) => {
    setSelectedProducts(prev =>
      prev.map(product => {
        if (product.sku === sku) {
          const maxQuantity = product.availableStock;
          const validQuantity = Math.min(Math.max(0, quantity), maxQuantity);
          return { ...product, quantity: validQuantity };
        }
        return product;
      })
    );
  };

  const handleRemoveProduct = (sku: string) => {
    setSelectedProducts(prev => prev.filter(product => product.sku !== sku));
  };

  const handleBinChange = (binCode: string) => {
    setSelectedBin(binCode);
    // Clear selected products when bin changes
    setSelectedProducts([]);
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
        description: "Debe seleccionar una ubicación",
        variant: "destructive",
      });
      return;
    }

    // Check for validation errors
    const hasErrors = validEntries.some(product => product.quantity > product.availableStock);
    if (hasErrors) {
      toast({
        title: "Error de validación",
        description: "No puedes retirar más stock del disponible",
        variant: "destructive",
      });
      return;
    }

    withdrawStockMutation.mutate({ entries: validEntries, bin: selectedBin });
  };

  const getQuantityError = (product: SelectedProduct) => {
    return product.quantity > product.availableStock;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          onClick={() => navigate('/productos')}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Productos
        </Button>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Retiro de Stock</h2>
            <p className="text-muted-foreground">Retirar productos del inventario</p>
          </div>
          <Button
            onClick={() => navigate('/productos/retirar/importar')}
            variant="outline"
            className="flex items-center gap-2"
          >
            Importar
          </Button>
        </div>

        <Card className="p-6 bg-card border-border">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <span className="text-sm text-muted-foreground">Seleccionar ubicación:</span>
                <Select value={selectedBin} onValueChange={handleBinChange}>
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

            {selectedBin && (
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
                    {products.map((product) => {
                      const stock = stockInfo.find(s => s.sku === product.sku);
                      const availableStock = stock?.disponibles || 0;
                      
                      return (
                        <div
                          key={product.id}
                          className={`p-3 hover:bg-accent cursor-pointer border-b border-border last:border-b-0 ${
                            availableStock === 0 ? 'opacity-50' : ''
                          }`}
                          onClick={() => handleProductSelect(product)}
                        >
                          <div className="font-medium text-foreground">{product.nombreProducto}</div>
                          <div className="text-sm text-muted-foreground">
                            SKU: {product.sku}
                            {product.variante && ` | Variante: ${product.variante}`}
                            {` | Disponible: ${availableStock}`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {selectedProducts.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-foreground">Productos Seleccionados</h3>
                
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Disponible</TableHead>
                      <TableHead>Cantidad a Retirar</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedProducts.map((product) => {
                      const hasError = getQuantityError(product);
                      return (
                        <TableRow key={product.sku} className={hasError ? 'bg-destructive/10' : ''}>
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
                            <span className="font-mono">{product.availableStock}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min="0"
                                max={product.availableStock}
                                value={product.quantity}
                                onChange={(e) => handleQuantityChange(product.sku, parseInt(e.target.value) || 0)}
                                className={`w-20 ${hasError ? 'border-destructive' : ''}`}
                              />
                              {hasError && (
                                <AlertTriangle className="h-4 w-4 text-destructive" />
                              )}
                            </div>
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
                      );
                    })}
                  </TableBody>
                </Table>

                <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-foreground mb-1 block">
                      Identificador Interno (Opcional)
                    </label>
                    <Input
                      placeholder="Ej: DEV-2024-001, ADJ-INV-123..."
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
                    disabled={withdrawStockMutation.isPending || selectedProducts.length === 0}
                    className="flex items-center gap-2"
                  >
                    <Minus className="h-4 w-4" />
                    {withdrawStockMutation.isPending ? 'Guardando...' : 'Retirar Stock'}
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