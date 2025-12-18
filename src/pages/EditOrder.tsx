import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ChevronLeft, Plus, Minus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
interface Pedido {
  id: string;
  tipo: string;
  pedido: string;
  tienda: string;
  cantidad: number;
  fecha_creacion: string;
}
interface PedidoDetalle {
  id: string;
  pedido: string;
  nombre_producto: string;
  variante: string | null;
  sku: string | null;
  cantidad: number;
  preparacion: string | null;
  bin: string | null;
}

interface Product {
  sku: string;
  nombreProducto: string;
  variante: string | null;
  totalDisponibles: number;
}

interface SelectedProduct extends Product {
  cantidadSeleccionada: number;
}

interface CantidadChange {
  id: string;
  originalCantidad: number;
  newCantidad: number;
}
export default function EditOrder() {
  const {
    orderId
  } = useParams();
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [detalles, setDetalles] = useState<PedidoDetalle[]>([]);
  const [loading, setLoading] = useState(true);
  const [changes, setChanges] = useState<CantidadChange[]>([]);
  
  // Product selection state
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [tempSelectedProducts, setTempSelectedProducts] = useState<SelectedProduct[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Filter products based on search query
  useEffect(() => {
    const filtered = products.filter(product =>
      product.nombreProducto.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (product.variante && product.variante.toLowerCase().includes(searchQuery.toLowerCase()))
    );
    setFilteredProducts(filtered);
  }, [searchQuery, products]);

  // Fetch products for adding to order
  const fetchProducts = async () => {
    try {
      // Fetch products with their stock information
      const { data: stockData, error: stockError } = await (supabase as any)
        .from('stockxbin')
        .select('sku, disponibles');

      if (stockError) {
        console.error('Error fetching stock:', stockError);
        return;
      }

      const { data: productsData, error: productsError } = await (supabase as any)
        .from('products')
        .select('sku, nombreProducto, variante');

      if (productsError) {
        console.error('Error fetching products:', productsError);
        return;
      }

      // Group stock by SKU and sum disponibles
      const stockBySku = stockData.reduce((acc: Record<string, number>, item: any) => {
        acc[item.sku] = (acc[item.sku] || 0) + (item.disponibles || 0);
        return acc;
      }, {});

      // Combine products with their total available stock
      const productsWithStock: Product[] = productsData
        .map((product: any) => ({
          sku: product.sku,
          nombreProducto: product.nombreProducto,
          variante: product.variante,
          totalDisponibles: stockBySku[product.sku] || 0,
        }))
        .filter((product: Product) => product.totalDisponibles > 0); // Only show products with available stock

      setProducts(productsWithStock);
      setFilteredProducts(productsWithStock);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los productos",
        variant: "destructive",
      });
    }
  };

  // Product selection functions
  const addToTempOrder = (product: Product) => {
    setTempSelectedProducts(prev => {
      const existing = prev.find(p => p.sku === product.sku);
      if (existing) {
        if (existing.cantidadSeleccionada < product.totalDisponibles) {
          return prev.map(p =>
            p.sku === product.sku
              ? { ...p, cantidadSeleccionada: p.cantidadSeleccionada + 1 }
              : p
          );
        }
        return prev;
      } else {
        return [...prev, { ...product, cantidadSeleccionada: 1 }];
      }
    });
  };

  const removeFromTempOrder = (sku: string) => {
    setTempSelectedProducts(prev => {
      const updated = prev.map(p =>
        p.sku === sku
          ? { ...p, cantidadSeleccionada: p.cantidadSeleccionada - 1 }
          : p
      ).filter(p => p.cantidadSeleccionada > 0);
      return updated;
    });
  };

  const getTempSelectedQuantity = (sku: string) => {
    const selected = tempSelectedProducts.find(p => p.sku === sku);
    return selected ? selected.cantidadSeleccionada : 0;
  };

  const openSearchDialog = () => {
    if (products.length === 0) {
      fetchProducts();
    }
    setTempSelectedProducts([]);
    setIsSearchOpen(true);
  };

  const confirmSelection = async () => {
    if (tempSelectedProducts.length === 0) {
      setIsSearchOpen(false);
      return;
    }

    try {
      const decodedOrderId = decodeURIComponent(orderId || '');
      
      if (!pedido) {
        toast({
          title: "Error",
          description: "No se puede agregar productos sin un pedido cargado",
          variant: "destructive"
        });
        return;
      }

      // Insertar los nuevos items en pedidos_detalle
      const orderInserts = tempSelectedProducts.map(product => ({
        pedido_id: pedido.id, // Usar el UUID del pedido
        sku: product.sku,
        nombre_producto: product.nombreProducto,
        variante: product.variante,
        cantidad_solicitada: product.cantidadSeleccionada,
        cantidad_asignada: 0
      }));

      const { error: insertError } = await supabase
        .from('pedidos_detalle')
        .insert(orderInserts);

      if (insertError) {
        console.error('Error adding products:', insertError);
        toast({
          title: "Error",
          description: "Hubo un error al agregar los productos al pedido",
          variant: "destructive"
        });
        return;
      }

      // Actualizar el total_items en la tabla pedidos
      const newTotalItems = (pedido.cantidad || 0) + tempSelectedProducts.reduce((sum, p) => sum + p.cantidadSeleccionada, 0);
      
      const { error: updateError } = await supabase
        .from('pedidos')
        .update({ total_items: newTotalItems })
        .eq('id', pedido.id);

      if (updateError) {
        console.error('Error updating total items:', updateError);
        // No mostramos error aquí porque los productos ya se agregaron
      }

      toast({
        title: "Productos agregados",
        description: `Se agregaron ${tempSelectedProducts.length} productos al pedido`,
      });

      // Refrescar los detalles del pedido
      const { data: detallesData } = await supabase
        .from('pedidos_detalle')
        .select('*')
        .eq('pedido_id', pedido.id);
      
      if (detallesData) {
        const detalles: PedidoDetalle[] = detallesData.map((item: any) => ({
          id: item.id,
          pedido: pedido.pedido,
          nombre_producto: item.nombre_producto || '',
          variante: item.variante,
          sku: item.sku,
          cantidad: item.cantidad_solicitada || 0,
          preparacion: 'no preparado',
          bin: null
        }));
        setDetalles(detalles);
      }

      // Actualizar el pedido local con el nuevo total
      setPedido({ ...pedido, cantidad: newTotalItems });

      setIsSearchOpen(false);
      setSearchQuery('');
    } catch (error) {
      console.error('Error adding products:', error);
      toast({
        title: "Error",
        description: "No se pudieron agregar los productos",
        variant: "destructive",
      });
    }
  };

  const cancelSelection = () => {
    setTempSelectedProducts([]);
    setIsSearchOpen(false);
    setSearchQuery('');
  };
  const handleBack = () => {
    const decodedOrderId = decodeURIComponent(orderId || '');
    navigate(`/orders/store/${encodeURIComponent(decodedOrderId)}`);
  };
  // Function to get total available stock for a SKU
  const getTotalStockForSku = async (sku: string): Promise<number> => {
    try {
      const { data, error } = await supabase
        .from('stock_totals')
        .select('total_disponible, total_comprometido')
        .eq('sku', sku)
        .single();
      
      if (error || !data) {
        console.error('Error fetching stock totals for SKU:', sku, error);
        return 0;
      }
      
      // Return total available stock (disponible + comprometido)
      return (data.total_disponible || 0) + (data.total_comprometido || 0);
    } catch (error) {
      console.error('Error getting total stock:', error);
      return 0;
    }
  };

  const handleCantidadChange = async (detalleId: string, newCantidad: number) => {
    const detalle = detalles.find(d => d.id === detalleId);
    if (!detalle) return;

    // Validate against total stock available for this SKU
    const totalStock = await getTotalStockForSku(detalle.sku);
    if (newCantidad > totalStock) {
      toast({
        title: "Stock insuficiente",
        description: `Solo hay ${totalStock} unidades disponibles del SKU ${detalle.sku} en todo el almacén`,
        variant: "destructive"
      });
      return;
    }

    // Update local state
    setDetalles(prev => prev.map(d => d.id === detalleId ? {
      ...d,
      cantidad: newCantidad
    } : d));

    // Update changes tracking
    setChanges(prev => {
      const existingChangeIndex = prev.findIndex(c => c.id === detalleId);
      const newChange: CantidadChange = {
        id: detalleId,
        originalCantidad: detalle.cantidad,
        newCantidad
      };
      if (existingChangeIndex >= 0) {
        // Update existing change
        const updatedChanges = [...prev];
        updatedChanges[existingChangeIndex] = newChange;

        // Remove if back to original
        if (newChange.originalCantidad === newChange.newCantidad) {
          updatedChanges.splice(existingChangeIndex, 1);
        }
        return updatedChanges;
      } else {
        // Add new change only if different from original
        if (newChange.originalCantidad !== newChange.newCantidad) {
          return [...prev, newChange];
        }
        return prev;
      }
    });
  };
  const handleUpdateOrder = async () => {
    if (changes.length === 0) {
      toast({
        title: "Sin cambios",
        description: "No hay cambios para actualizar."
      });
      return;
    }

    if (!pedido) {
      toast({
        title: "Error",
        description: "No se encontró el pedido para actualizar",
        variant: "destructive"
      });
      return;
    }

    try {
      // Actualizar cada cambio en la tabla pedidos_detalle
      for (const change of changes) {
        const { error } = await supabase
          .from('pedidos_detalle')
          .update({
            cantidad_solicitada: change.newCantidad
          })
          .eq('id', change.id);

        if (error) {
          console.error('Error updating item:', error);
          toast({
            title: "Error",
            description: "Hubo un error al actualizar el pedido.",
            variant: "destructive"
          });
          return;
        }
      }

      // Recalcular el total_items basado en los nuevos valores
      const newTotalItems = detalles.reduce((sum, detalle) => {
        const change = changes.find(c => c.id === detalle.id);
        const cantidad = change ? change.newCantidad : detalle.cantidad;
        return sum + cantidad;
      }, 0);

      // Actualizar el total_items en la tabla pedidos
      const { error: updatePedidoError } = await supabase
        .from('pedidos')
        .update({ total_items: newTotalItems })
        .eq('id', pedido.id);

      if (updatePedidoError) {
        console.error('Error updating pedido total:', updatePedidoError);
        // No retornamos error aquí porque los detalles ya se actualizaron
      }

      // Reasignar automáticamente el stock del pedido
      const { error: reassignError } = await supabase.rpc('reassign_order_items', {
        order_id: pedido.id
      });

      if (reassignError) {
        console.error('Error reassigning order items:', reassignError);
        toast({
          title: "Advertencia",
          description: "El pedido se actualizó pero hubo problemas con la reasignación de stock. Revisa las asignaciones.",
          variant: "destructive"
        });
        return;
      }

      // Refrescar los datos para mostrar las nuevas asignaciones
      await fetchPedidoAndDetails();

      toast({
        title: "Pedido actualizado",
        description: "Las cantidades han sido actualizadas y el stock reasignado exitosamente."
      });

      // Clear changes
      setChanges([]);

      // Navigate back
      const decodedOrderId = decodeURIComponent(orderId || '');
      navigate(`/orders/store/${encodeURIComponent(decodedOrderId)}`);
    } catch (error) {
      console.error('Error updating order:', error);
      toast({
        title: "Error",
        description: "Hubo un error al actualizar el pedido.",
        variant: "destructive"
      });
    }
  };
  useEffect(() => {
    fetchPedidoAndDetails();
  }, [orderId]);

  async function fetchPedidoAndDetails() {
    if (!orderId) return;
    const decodedOrderId = decodeURIComponent(orderId);
    console.log('EditOrder - orderId from params:', orderId);
    console.log('EditOrder - decodedOrderId:', decodedOrderId);
    try {
      // Cargar datos del pedido desde la nueva estructura de base de datos
      console.log('Cargando pedido para editar:', decodedOrderId);
      
      // Obtener información básica del pedido
      const { data: pedidoData, error: pedidoError } = await supabase
        .from('pedidos')
        .select('*')
        .eq('pedido_id', decodedOrderId)
        .single();
      
      if (pedidoError) {
        console.error('Error fetching pedido:', pedidoError);
        setPedido(null);
        setDetalles([]);
        return;
      }
      
      if (!pedidoData) {
        console.log('No se encontró el pedido:', decodedOrderId);
        setPedido(null);
        setDetalles([]);
        return;
      }
      
      // Mapear datos del pedido a la interfaz esperada
      const pedido: Pedido = {
        id: pedidoData.id,
        tipo: 'Tienda', // Por defecto asumimos que es tienda
        pedido: pedidoData.pedido_id,
        tienda: pedidoData.tienda_nombre || 'Sin tienda',
        cantidad: pedidoData.total_items || 0,
        fecha_creacion: pedidoData.created_at
      };
      
      setPedido(pedido);
      
      // Obtener detalles del pedido
      const { data: detallesData, error: detallesError } = await supabase
        .from('pedidos_detalle')
        .select('*')
        .eq('pedido_id', pedidoData.id);
      
      if (detallesError) {
        console.error('Error fetching detalles:', detallesError);
        setDetalles([]);
        return;
      }
      
      // Mapear detalles a la interfaz esperada
      const detalles: PedidoDetalle[] = detallesData?.map((item: any) => ({
        id: item.id,
        pedido: pedidoData.pedido_id,
        nombre_producto: item.nombre_producto || '',
        variante: item.variante,
        sku: item.sku,
        cantidad: item.cantidad_solicitada || 0,
        preparacion: 'no preparado', // Por defecto, ya que no tenemos este campo aún
        bin: null // Por defecto
      })) || [];
      
      setDetalles(detalles);
      console.log('Pedido cargado para editar exitosamente:', pedido);
      console.log('Detalles cargados para editar:', detalles);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }
  if (loading) {
    return <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Cargando...</h2>
          <p className="text-muted-foreground">Cargando información del pedido...</p>
        </div>
        <Card className="p-6 bg-card border-border">
          <div className="text-center text-muted-foreground">Cargando...</div>
        </Card>
      </div>;
  }
  if (!pedido) {
    return <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={handleBack} className="p-2">
            <ChevronLeft size={20} />
          </Button>
          <h2 className="text-xl font-semibold text-foreground">Pedido no encontrado</h2>
        </div>
        <Card className="p-6 bg-card border-border">
          <div className="text-center text-muted-foreground">No se pudo encontrar el pedido solicitado.</div>
        </Card>
      </div>;
  }
  const noPreparados = detalles.filter(d => d.preparacion !== 'preparado');
  const preparados = detalles.filter(d => d.preparacion === 'preparado');
  return <div className="flex gap-6">
      {/* Main content */}
      <div className="flex-1 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={handleBack} className="p-2">
              <ChevronLeft size={20} />
            </Button>
            <h1 className="text-2xl font-semibold text-foreground">
              {pedido.pedido} › Editar pedido
            </h1>
          </div>
          <Button variant="outline" onClick={openSearchDialog}>
            <Plus size={16} className="mr-2" />
            Agregar productos
          </Button>
        </div>

        {/* No preparados section */}
        {noPreparados.length > 0 && <div className="space-y-4">
            
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground font-medium border-b pb-2">
                <div>Producto</div>
                <div>Cantidad</div>
              </div>
              
              {noPreparados.map(detalle => <Card key={detalle.id} className="p-4 bg-card border-border">
                  <div className="grid grid-cols-2 gap-4 items-center">
                    <div>
                      <h3 className="font-medium text-foreground">{detalle.nombre_producto}</h3>
                      <p className="text-sm text-muted-foreground">
                        {detalle.variante} {detalle.sku}
                      </p>
                    </div>
                    
                    <div>
                      <Input type="number" min="0" value={detalle.cantidad} onChange={e => handleCantidadChange(detalle.id, parseInt(e.target.value) || 0)} className="w-20" />
                    </div>
                  </div>
                </Card>)}
            </div>
          </div>}

        {/* Preparados section */}
        {preparados.length > 0 && <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge className="bg-green-100 text-green-800 border-0 px-3 py-1">
                😊 Preparado
              </Badge>
            </div>
            
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground font-medium border-b pb-2">
                <div>Producto</div>
                <div>Cantidad</div>
              </div>
              
              {preparados.map(detalle => <Card key={detalle.id} className="p-4 bg-card border-border opacity-60">
                  <div className="grid grid-cols-2 gap-4 items-center">
                    <div>
                      <h3 className="font-medium text-foreground">{detalle.nombre_producto}</h3>
                      <p className="text-sm text-muted-foreground">
                        {detalle.variante} {detalle.sku}
                      </p>
                    </div>
                    
                    <div>
                      <span className="text-foreground font-medium">{detalle.cantidad}</span>
                    </div>
                  </div>
                </Card>)}
              
              <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded">
                No es posible modificar las cantidades de artículos preparados
              </div>
            </div>
          </div>}
      </div>

      {/* Summary sidebar */}
      <div className="w-80">
        <Card className="p-6 bg-card border-border sticky top-6">
          <h3 className="font-semibold text-foreground mb-4">Resumen</h3>
          
          {changes.length === 0 ? <p className="text-muted-foreground mb-6">No se realizó ningún cambio</p> : <div className="space-y-3 mb-6">
              {changes.map(change => {
            const detalle = detalles.find(d => d.id === change.id);
            if (!detalle) return null;
            return <div key={change.id} className="text-sm">
                    <p className="font-medium text-foreground">{detalle.nombre_producto}</p>
                    <p className="text-muted-foreground">
                      {change.originalCantidad} → {change.newCantidad}
                    </p>
                  </div>;
          })}
            </div>}
          
          <Button onClick={handleUpdateOrder} disabled={changes.length === 0} className="w-full">
            Actualizar pedido
          </Button>
        </Card>
      </div>

      {/* Search Dialog */}
      <Dialog open={isSearchOpen} onOpenChange={setIsSearchOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Seleccionar productos</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 flex-1 overflow-hidden">
            {/* Search input inside dialog */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={20} />
              <Input
                placeholder="Buscar productos"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                autoFocus
              />
            </div>

            {/* Products header */}
            <div className="flex justify-between items-center border-b pb-2">
              <span className="text-sm text-muted-foreground">Productos</span>
              <span className="text-sm text-muted-foreground">Disponible</span>
            </div>

            {/* Products list in dialog */}
            <div className="space-y-2 overflow-y-auto flex-1 max-h-96">
              {filteredProducts.map(product => (
                <div key={product.sku} className="flex items-center justify-between py-3 border-b">
                  <div className="flex items-center gap-3 flex-1">
                    <input
                      type="checkbox"
                      checked={getTempSelectedQuantity(product.sku) > 0}
                      onChange={() => {
                        if (getTempSelectedQuantity(product.sku) > 0) {
                          setTempSelectedProducts(prev => prev.filter(p => p.sku !== product.sku));
                        } else {
                          addToTempOrder(product);
                        }
                      }}
                      className="rounded"
                    />
                    <div className="flex-1">
                      <h4 className="font-medium">{product.nombreProducto}</h4>
                      {product.variante && (
                        <p className="text-sm text-muted-foreground">{product.variante}</p>
                      )}
                      <p className="text-sm text-muted-foreground">{product.sku}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {getTempSelectedQuantity(product.sku) > 0 && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeFromTempOrder(product.sku)}
                        >
                          <Minus size={16} />
                        </Button>
                        <span className="w-8 text-center">{getTempSelectedQuantity(product.sku)}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addToTempOrder(product)}
                          disabled={getTempSelectedQuantity(product.sku) >= product.totalDisponibles}
                        >
                          <Plus size={16} />
                        </Button>
                      </div>
                    )}
                    <span className="text-sm text-muted-foreground w-12 text-right">
                      {product.totalDisponibles}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between border-t pt-4">
            <div className="text-sm text-muted-foreground">
              {tempSelectedProducts.length}/{products.length} variantes seleccionadas
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={cancelSelection}>
                Cancelar
              </Button>
              <Button onClick={confirmSelection}>
                Agregar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>;
}