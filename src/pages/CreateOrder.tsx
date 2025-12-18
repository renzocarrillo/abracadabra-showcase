import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Minus, ShoppingCart, Package, Loader2, RefreshCw, Image } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useOptimizedSearch } from '@/hooks/useOptimizedSearch';
import { cn } from '@/lib/utils';

interface Product {
  sku: string;
  nombreProducto: string;
  variante: string | null;
  totalDisponibles: number;
}

interface SelectedProduct extends Product {
  cantidadSolicitada: number;
}

interface Store {
  id: string;
  nombre: string;
  officeid: string;
  pertenenceinnovacion: boolean;
}

interface CreateOrderAtomicResponse {
  success: boolean;
  error?: 'INSUFFICIENT_STOCK' | 'FROZEN_PRODUCT' | 'TRANSACTION_FAILED' | 'PARTIAL_ASSIGNMENT' | 'CONCURRENT_STOCK_CONFLICT';
  details?: Array<{sku: string, nombre: string, solicitado: number, disponible: number}> | {
    unassigned_items: Array<{sku: string, nombre: string, solicitado: number, sin_asignar: number}>
  };
  sku?: string;
  nombre?: string;
  message?: string;
  order_id?: string;
  order_number?: string;
  total_items?: number;
}

export default function CreateOrder() {
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [variantImages, setVariantImages] = useState<Record<string, string>>({});
  const [loadingImages, setLoadingImages] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  // Hook optimizado para búsqueda de productos
  const {
    searchQuery,
    setSearchQuery,
    results: products,
    isSearching: loading,
    hasMinChars
  } = useOptimizedSearch({
    minChars: 3,
    includeStock: true,
    limit: 20
  });

  useEffect(() => {
    fetchStores();
  }, []);

  const fetchStores = async () => {
    try {
      const { data: storesData, error } = await supabase
        .from('tiendas')
        .select('id, nombre, officeid, pertenenceinnovacion')
        .neq('nombre', 'ALMCENTRAL')
        .order('nombre');

      if (error) throw error;
      setStores(storesData || []);
    } catch (error) {
      console.error('Error fetching stores:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las tiendas",
        variant: "destructive",
      });
    }
  };

  const fetchAndOpenImage = async (sku: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (variantImages[sku]) {
      window.open(variantImages[sku], '_blank');
      return;
    }
    
    setLoadingImages(prev => ({ ...prev, [sku]: true }));
    
    try {
      // 1. Buscar imagen específica de variante en caché
      const { data: variantImage } = await supabase
        .from('shopify_product_images')
        .select('src')
        .eq('variant_sku', sku)
        .order('position', { ascending: true })
        .limit(1)
        .maybeSingle();
      
      if (variantImage?.src) {
        setVariantImages(prev => ({ ...prev, [sku]: variantImage.src }));
        window.open(variantImage.src, '_blank');
        return;
      }
      
      // 2. Fallback: buscar imagen general del producto
      const { data: variantData } = await supabase
        .from('variants')
        .select('idProductoBsale')
        .eq('sku', sku)
        .single();
      
      if (variantData?.idProductoBsale) {
        const { data: generalImage } = await supabase
          .from('shopify_product_images')
          .select('src')
          .eq('product_id', variantData.idProductoBsale)
          .eq('is_general_image', true)
          .order('position', { ascending: true })
          .limit(1)
          .maybeSingle();
        
        if (generalImage?.src) {
          setVariantImages(prev => ({ ...prev, [sku]: generalImage.src }));
          window.open(generalImage.src, '_blank');
          return;
        }
      }
      
      // 3. Último recurso: edge function
      const { data, error } = await supabase.functions.invoke('get-shopify-product-images', {
        body: { variant_sku: sku }
      });
      
      if (error) throw error;
      
      if (data?.images?.length > 0) {
        setVariantImages(prev => ({ ...prev, [sku]: data.images[0].src }));
        window.open(data.images[0].src, '_blank');
      } else {
        toast({
          title: "Sin imagen",
          description: "Este producto no tiene imagen disponible",
        });
      }
    } catch (error) {
      console.error('Error fetching image:', error);
      toast({
        title: "Error",
        description: "No se pudo obtener la imagen",
        variant: "destructive"
      });
    } finally {
      setLoadingImages(prev => ({ ...prev, [sku]: false }));
    }
  };

  const addProductToOrder = async (product: any) => {
    // Check if product is frozen before adding
    try {
      const { data: isFrozen, error } = await supabase
        .rpc('is_product_frozen_for_transfer', { product_sku: product.sku });
      
      if (error) throw error;
      
      if (isFrozen) {
        toast({
          title: "Producto congelado",
          description: `${product.nombreProducto} está congelado y no puede ser trasladado`,
          variant: "destructive",
        });
        return;
      }
    } catch (error) {
      console.error('Error checking if product is frozen:', error);
      // Continue with the operation if the check fails
    }
    
    const existingProduct = selectedProducts.find(p => p.sku === product.sku);
    
    if (existingProduct) {
      // Check if we can add one more unit
      if (existingProduct.cantidadSolicitada >= existingProduct.totalDisponibles) {
        toast({
          title: "Stock insuficiente",
          description: `Solo hay ${existingProduct.totalDisponibles} unidades disponibles`,
          variant: "destructive",
        });
        return;
      }
      
      setSelectedProducts(prev => 
        prev.map(p => 
          p.sku === product.sku 
            ? { ...p, cantidadSolicitada: p.cantidadSolicitada + 1 }
            : p
        )
      );
    } else {
      // Check if there's any stock available
      if (product.totalDisponibles <= 0) {
        toast({
          title: "Sin stock disponible",
          description: `No hay unidades disponibles para ${product.nombreProducto}`,
          variant: "destructive",
        });
        return;
      }
      
      const newProduct: SelectedProduct = {
        sku: product.sku,
        nombreProducto: product.nombreProducto,
        variante: product.variante,
        totalDisponibles: product.totalDisponibles,
        cantidadSolicitada: 1
      };
      setSelectedProducts(prev => [...prev, newProduct]);
    }
    
    // Only close dialog and clear search if adding from search dialog
    if (isProductDialogOpen) {
      setIsProductDialogOpen(false);
      setSearchQuery('');
    }
    
    toast({
      title: "Producto agregado",
      description: `${product.nombreProducto} agregado al pedido`,
    });
  };

  const removeProductFromOrder = (sku: string) => {
    const product = selectedProducts.find(p => p.sku === sku);
    if (!product) return;

    if (product.cantidadSolicitada > 1) {
      setSelectedProducts(prev =>
        prev.map(p =>
          p.sku === sku
            ? { ...p, cantidadSolicitada: p.cantidadSolicitada - 1 }
            : p
        )
      );
    } else {
      setSelectedProducts(prev => prev.filter(p => p.sku !== sku));
    }
  };

  const updateProductQuantity = (sku: string, newQuantity: number) => {
    const product = selectedProducts.find(p => p.sku === sku);
    if (!product) return;

    const maxQuantity = product.totalDisponibles;
    const validQuantity = Math.min(Math.max(1, newQuantity), maxQuantity);

    setSelectedProducts(prev =>
      prev.map(p =>
        p.sku === sku ? { ...p, cantidadSolicitada: validQuantity } : p
      )
    );

    if (newQuantity > maxQuantity) {
      toast({
        title: "Stock insuficiente",
        description: `Solo hay ${maxQuantity} unidades disponibles`,
        variant: "destructive",
      });
    }
  };

  const getSelectedQuantity = (sku: string): number => {
    return selectedProducts.find(p => p.sku === sku)?.cantidadSolicitada || 0;
  };

  // Function to refresh stock data for selected products
  const refreshSelectedProductsStock = async () => {
    if (selectedProducts.length === 0) return;

    try {
      const skus = selectedProducts.map(p => p.sku);
      const { data: stockData, error } = await supabase
        .from('stock_totals')
        .select('sku, total_disponible')
        .in('sku', skus);

      if (error) throw error;

      if (stockData) {
        const stockMap = new Map(stockData.map(s => [s.sku, s.total_disponible]));
        
        setSelectedProducts(prev => 
          prev.map(product => ({
            ...product,
            totalDisponibles: stockMap.get(product.sku) || 0
          }))
        );
      }
    } catch (error) {
      console.error('Error refreshing stock data:', error);
    }
  };

  const createOrder = async () => {
    // Validaciones básicas de UI (sin consultar BD)
    if (selectedProducts.length === 0) {
      toast({
        title: "Error",
        description: "Debe seleccionar al menos un producto",
        variant: "destructive",
      });
      return;
    }

    if (!selectedStoreId) {
      toast({
        title: "Error",
        description: "Debe seleccionar una tienda de destino",
        variant: "destructive",
      });
      return;
    }

    setCreatingOrder(true);

    try {
      const selectedStore = stores.find(s => s.id === selectedStoreId);
      
      // Una única llamada atómica que hace todo
      const { data: rawData, error } = await supabase.rpc('create_order_atomic', {
        p_tienda_id: selectedStoreId,
        p_tienda_nombre: selectedStore?.nombre || '',
        p_productos: selectedProducts.map(p => ({
          sku: p.sku,
          nombre_producto: p.nombreProducto,
          variante: p.variante,
          cantidad_solicitada: p.cantidadSolicitada
        }))
      });

      if (error) throw error;

      // Validar que rawData sea un objeto válido con success
      if (!rawData || typeof rawData !== 'object' || !('success' in rawData)) {
        console.error('Respuesta inesperada del RPC:', rawData);
        toast({
          title: "Error",
          description: "Respuesta inesperada del servidor. Por favor, intente de nuevo.",
          variant: "destructive",
        });
        return;
      }

      const data = rawData as unknown as CreateOrderAtomicResponse;

      if (!data.success) {
        // Manejar errores específicos retornados por el RPC
        if (data.error === 'INSUFFICIENT_STOCK') {
          const problems = data.details as Array<{sku: string, nombre: string, solicitado: number, disponible: number}>;
          const errorMessage = problems.length === 1
            ? `${problems[0].nombre} (SKU: ${problems[0].sku}) - Solicitado: ${problems[0].solicitado}, Disponible: ${problems[0].disponible}`
            : `${problems.length} productos sin stock suficiente`;
          
          if (problems.length > 1) {
            console.error('Productos sin stock suficiente:', problems);
          }
          
          toast({
            title: "Stock insuficiente",
            description: errorMessage,
            variant: "destructive",
          });
        } else if (data.error === 'FROZEN_PRODUCT') {
          toast({
            title: "Producto congelado",
            description: `${data.nombre} (SKU: ${data.sku}) está congelado y no puede ser trasladado`,
            variant: "destructive",
          });
        } else if (data.error === 'PARTIAL_ASSIGNMENT') {
          const assignmentDetails = data.details as {
            unassigned_items: Array<{sku: string, nombre: string, solicitado: number, sin_asignar: number}>
          };
          const items = assignmentDetails.unassigned_items;
          const errorMessage = items.length === 1
            ? `No se pudo asignar ${items[0].sin_asignar} de ${items[0].solicitado} unidades de ${items[0].nombre}`
            : `${items.length} productos no pudieron asignarse completamente en bins`;
          
          console.error('Asignación parcial de bins:', items);
          
          toast({
            title: "Error de asignación",
            description: errorMessage,
            variant: "destructive",
          });
        } else if (data.error === 'CONCURRENT_STOCK_CONFLICT') {
          toast({
            title: "Conflicto de concurrencia",
            description: data.message || "Otro usuario está procesando el mismo stock. Por favor, intente de nuevo.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Error",
            description: data.message || "Error al crear el pedido",
            variant: "destructive",
          });
        }
        return;
      }

      // Éxito
      toast({
        title: "Pedido creado",
        description: `Pedido ${data.order_number} creado exitosamente`,
      });

      setSelectedProducts([]);
      setSelectedStoreId('');

    } catch (error) {
      console.error('Error creating order:', error);
      toast({
        title: "Error",
        description: "Error al crear el pedido",
        variant: "destructive",
      });
    } finally {
      setCreatingOrder(false);
    }
  };

  const clearOrder = () => {
    setSelectedProducts([]);
    setSelectedStoreId('');
  };

  const totalVariants = selectedProducts.length;
  const totalQuantity = selectedProducts.reduce((sum, p) => sum + p.cantidadSolicitada, 0);

  return (
    <div className="container mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">Crear Pedido de Traslado</h1>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
        {/* Selección de productos */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Productos Disponibles</h2>
            <div className="flex space-x-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={refreshSelectedProductsStock}
                disabled={selectedProducts.length === 0}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Actualizar Stock
              </Button>
              <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
                <Button onClick={() => setIsProductDialogOpen(true)}>
                  <Search className="w-4 h-4 mr-2" />
                  Buscar Productos
                </Button>
                <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Buscar y Agregar Productos</DialogTitle>
                </DialogHeader>
                
                <div className="mb-4">
                  <div className="relative">
                    <Input
                      placeholder={hasMinChars ? "Buscar productos..." : "Escribe al menos 3 caracteres..."}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pr-10"
                    />
                    {loading && (
                      <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  
                  {!hasMinChars && searchQuery.length > 0 && (
                    <div className="mt-2 p-3 bg-muted rounded-md">
                      <div className="text-sm text-muted-foreground">
                        Escribe al menos 3 caracteres para buscar
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {hasMinChars && products.length === 0 && !loading ? (
                    <div className="py-8 text-center text-muted-foreground">
                      No se encontraron productos
                    </div>
                  ) : hasMinChars ? (
                    products.map((product) => (
                      <div
                        key={product.sku}
                        className={cn(
                          "flex items-center justify-between p-3 border rounded-lg",
                          product.totalDisponibles > 0 
                            ? "hover:bg-accent" 
                            : "opacity-60 bg-muted/30"
                        )}
                      >
                        <div 
                          className={cn(
                            "flex-1",
                            product.totalDisponibles > 0 && "cursor-pointer"
                          )}
                          onClick={() => product.totalDisponibles > 0 && addProductToOrder(product)}
                        >
                          <div className="font-medium">{product.nombreProducto}</div>
                          <div className="text-sm text-muted-foreground">
                            SKU: {product.sku}
                            {product.variante && ` - ${product.variante}`}
                          </div>
                          <Badge 
                            variant={product.totalDisponibles > 0 ? "secondary" : "destructive"}
                            className="mt-1"
                          >
                            {product.totalDisponibles > 0 
                              ? `Stock: ${product.totalDisponibles}` 
                              : "Agotado"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => fetchAndOpenImage(product.sku, e)}
                            disabled={loadingImages[product.sku]}
                            className="h-8 w-8 p-0"
                          >
                            {loadingImages[product.sku] ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Image className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => addProductToOrder(product)}
                            disabled={product.totalDisponibles === 0}
                            className="h-8 w-8 p-0"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-8 text-center text-muted-foreground">
                      <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Escribe al menos 3 caracteres para buscar productos</p>
                    </div>
                  )}
                </div>
              </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="space-y-4">
            {selectedProducts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No hay productos seleccionados</p>
                <p className="text-sm">Haz clic en "Buscar Productos" para agregar items al pedido</p>
              </div>
            ) : (
              selectedProducts.map((product) => (
                <div key={product.sku} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium">{product.nombreProducto}</div>
                    <div className="text-sm text-muted-foreground">
                      SKU: {product.sku}
                      {product.variante && ` - ${product.variante}`}
                    </div>
                    <div className="flex items-center space-x-2 text-sm">
                      <span className="text-muted-foreground">Stock disponible:</span>
                      <Badge 
                        variant={product.totalDisponibles >= product.cantidadSolicitada ? "secondary" : "destructive"}
                        className="text-xs"
                      >
                        {product.totalDisponibles}
                      </Badge>
                      {product.totalDisponibles < product.cantidadSolicitada && (
                        <span className="text-destructive text-xs font-medium">
                          ¡Stock insuficiente!
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => removeProductFromOrder(product.sku)}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input
                      type="number"
                      min="1"
                      max={product.totalDisponibles}
                      value={product.cantidadSolicitada}
                      onChange={(e) => updateProductQuantity(product.sku, parseInt(e.target.value) || 1)}
                      className="w-20 text-center"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => addProductToOrder(product)}
                      disabled={product.cantidadSolicitada >= product.totalDisponibles}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Resumen del pedido */}
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Resumen del Pedido</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total de variantes:</span>
                <span className="font-medium">{totalVariants}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cantidad total:</span>
                <span className="font-medium">{totalQuantity}</span>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Tienda de Destino</h2>
            <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar tienda..." />
              </SelectTrigger>
              <SelectContent>
                {stores
                  .filter((store) => store.nombre !== 'ALMCENTRAL')
                  .map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.nombre}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Card>

          <div className="flex space-x-2">
            <Button
              onClick={createOrder}
              disabled={selectedProducts.length === 0 || !selectedStoreId || creatingOrder}
              className="flex-1"
            >
              {creatingOrder ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creando...
                </>
              ) : (
                <>
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Crear Traslado
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={clearOrder}
              disabled={selectedProducts.length === 0}
            >
              Limpiar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}