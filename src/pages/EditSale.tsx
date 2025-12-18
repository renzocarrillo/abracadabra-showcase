import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ChevronLeft, Plus, Minus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Venta {
  id: string;
  venta_id: string;
  estado: string;
  cliente_info: any;
  envio_info: any;
  total: number;
  subtotal: number;
  igv: number;
  created_at: string;
  url_public_view?: string;
  serial_number?: string;
  id_bsale_documento?: number;
  documento_tipo?: string;
}

interface VentaDetalle {
  id: string;
  sku: string;
  nombre_producto: string;
  variante: string | null;
  cantidad: number;
  precio_unitario: number;
  valor_unitario: number;
  subtotal_linea: number;
}

interface Product {
  sku: string;
  nombreProducto: string;
  variante: string | null;
  totalDisponibles: number;
  precio?: number;
}

interface SelectedProduct extends Product {
  cantidadSeleccionada: number;
  precioUnitario: number;
}

interface CantidadChange {
  id: string;
  originalCantidad: number;
  newCantidad: number;
}

interface PrecioChange {
  id: string;
  originalPrecio: number;
  newPrecio: number;
}

export default function EditSale() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [venta, setVenta] = useState<Venta | null>(null);
  const [detalles, setDetalles] = useState<VentaDetalle[]>([]);
  const [loading, setLoading] = useState(true);
  const [changes, setChanges] = useState<CantidadChange[]>([]);
  const [precioChanges, setPrecioChanges] = useState<PrecioChange[]>([]);
  
  // Product selection state
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [tempSelectedProducts, setTempSelectedProducts] = useState<SelectedProduct[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [stockAvailable, setStockAvailable] = useState<Record<string, number>>({});

  // Filter products based on search query
  useEffect(() => {
    const filtered = products.filter(product =>
      product.nombreProducto.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (product.variante && product.variante.toLowerCase().includes(searchQuery.toLowerCase()))
    );
    setFilteredProducts(filtered);
  }, [searchQuery, products]);

  const handleBack = () => {
    const decodedOrderId = decodeURIComponent(orderId || '');
    navigate(`/orders/sale/${encodeURIComponent(decodedOrderId)}`);
  };

  // Fetch products for adding to sale
  const fetchProducts = async () => {
    try {
      // Fetch products with their stock information
      const { data: stockData, error: stockError } = await supabase
        .from('stockxbin')
        .select('sku, disponibles');

      if (stockError) {
        console.error('Error fetching stock:', stockError);
        return;
      }

      const { data: variantsData, error: variantsError } = await supabase
        .from('variants')
        .select('sku, nombreProducto, variante');

      if (variantsError) {
        console.error('Error fetching variants:', variantsError);
        return;
      }

      // Group stock by SKU and sum disponibles
      const stockBySku = stockData.reduce((acc: Record<string, number>, item: any) => {
        acc[item.sku] = (acc[item.sku] || 0) + (item.disponibles || 0);
        return acc;
      }, {});

      // Combine products with their total available stock
      const productsWithStock: Product[] = variantsData
        .map((variant: any) => ({
          sku: variant.sku,
          nombreProducto: variant.nombreProducto,
          variante: variant.variante,
          totalDisponibles: stockBySku[variant.sku] || 0,
        }))
        .filter((product: Product) => product.totalDisponibles > 0);

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
        return [...prev, { ...product, cantidadSeleccionada: 1, precioUnitario: 0 }];
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
      if (!venta) {
        toast({
          title: "Error",
          description: "No se puede agregar productos sin una venta cargada",
          variant: "destructive"
        });
        return;
      }

      // Insert new items in ventas_detalle
      const saleInserts = tempSelectedProducts.map(product => ({
        venta_id: venta.id,
        sku: product.sku,
        nombre_producto: product.nombreProducto,
        variante: product.variante,
        cantidad: product.cantidadSeleccionada,
        precio_unitario: product.precioUnitario,
        valor_unitario: (product.cantidadSeleccionada * product.precioUnitario) / 1.18, // O.P. Gravada
        subtotal_linea: product.cantidadSeleccionada * product.precioUnitario // Total línea
      }));

      const { error: insertError } = await supabase
        .from('ventas_detalle')
        .insert(saleInserts);

      if (insertError) {
        console.error('Error adding products:', insertError);
        toast({
          title: "Error",
          description: "Hubo un error al agregar los productos a la venta",
          variant: "destructive"
        });
        return;
      }

      // Calculate new totals
      const newTotal = tempSelectedProducts.reduce((sum, p) => sum + (p.cantidadSeleccionada * p.precioUnitario), 0);
      const currentTotal = venta.total || 0;
      const updatedTotal = currentTotal + newTotal;
      const updatedOpGravada = updatedTotal / 1.18;
      const updatedIgv = updatedTotal - updatedOpGravada;

      // Update venta totals
      const { error: updateError } = await supabase
        .from('ventas')
        .update({ 
          subtotal: updatedOpGravada, // Store O.P. Gravada in subtotal field
          igv: updatedIgv,
          total: updatedTotal 
        })
        .eq('id', venta.id);

      if (updateError) {
        console.error('Error updating totals:', updateError);
      }

      // Asignar bins con sistema de 2 estados (reservado)
      console.log('🔵 Asignando bins (sistema 2 estados - reservado)...');
      const { data: assignResult, error: assignError } = await supabase.rpc('assign_bins_to_sale_v2', {
        sale_id: venta.id
      });

      if (assignError) {
        console.error('❌ Error al asignar bins:', assignError);
        toast({
          title: "Error crítico",
          description: `No se pudo asignar stock: ${assignError.message}`,
          variant: "destructive"
        });
        return;
      }

      // Verificar resultado de asignación (type cast for JSON response)
      const result = assignResult as any;
      if (!result || !result.success) {
        console.error('❌ Asignación fallida:', result);
        
        let errorMessage = 'No se pudo completar la asignación.\n';
        
        if (result?.frozen_products?.length > 0) {
          errorMessage += `\nProductos congelados: ${result.frozen_products.length}`;
        }
        
        if (result?.insufficient_stock?.length > 0) {
          errorMessage += `\nStock insuficiente: ${result.insufficient_stock.length}`;
        }
        
        toast({
          title: "Asignación fallida",
          description: errorMessage,
          variant: "destructive"
        });
        return;
      }

      // Validación final
      const { count: assignmentsCount } = await supabase
        .from('ventas_asignaciones')
        .select('*', { count: 'exact', head: true })
        .eq('venta_id', venta.id);

      if (!assignmentsCount) {
        toast({
          title: "Error crítico",
          description: "Asignaciones no persistidas correctamente",
          variant: "destructive"
        });
        return;
      }

      console.log(`✅ Asignación exitosa: ${assignmentsCount} registros`);

      toast({
        title: "Productos agregados",
        description: `Se agregaron ${tempSelectedProducts.length} productos a la venta`,
      });

      // Refresh the sale details
      await fetchVentaAndDetails();

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

  const handleCantidadChange = async (detalleId: string, newCantidad: number) => {
    const detalle = detalles.find(d => d.id === detalleId);
    if (!detalle) return;

    if (newCantidad < 0) return;

    // Check available stock limit
    const availableStock = stockAvailable[detalle.sku] || 0;
    if (newCantidad > availableStock) {
      toast({
        title: "Stock insuficiente",
        description: `Solo hay ${availableStock} unidades disponibles para ${detalle.nombre_producto}`,
        variant: "destructive"
      });
      return;
    }

    // Update local state
    setDetalles(prev => prev.map(d => d.id === detalleId ? {
      ...d,
      cantidad: newCantidad,
      subtotal_linea: newCantidad * d.precio_unitario // Total línea
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
        const updatedChanges = [...prev];
        updatedChanges[existingChangeIndex] = newChange;

        if (newChange.originalCantidad === newChange.newCantidad) {
          updatedChanges.splice(existingChangeIndex, 1);
        }
        return updatedChanges;
      } else {
        if (newChange.originalCantidad !== newChange.newCantidad) {
          return [...prev, newChange];
        }
        return prev;
      }
    });
  };

  const handlePrecioChange = async (detalleId: string, newPrecio: number) => {
    const detalle = detalles.find(d => d.id === detalleId);
    if (!detalle) return;

    if (newPrecio < 0) return;

    // Update local state
    setDetalles(prev => prev.map(d => d.id === detalleId ? {
      ...d,
      precio_unitario: newPrecio,
      valor_unitario: (d.cantidad * newPrecio) / 1.18, // O.P. Gravada línea
      subtotal_linea: d.cantidad * newPrecio // Total línea
    } : d));

    // Update price changes tracking
    setPrecioChanges(prev => {
      const existingChangeIndex = prev.findIndex(c => c.id === detalleId);
      const newChange: PrecioChange = {
        id: detalleId,
        originalPrecio: detalle.precio_unitario,
        newPrecio
      };
      if (existingChangeIndex >= 0) {
        const updatedChanges = [...prev];
        updatedChanges[existingChangeIndex] = newChange;

        if (newChange.originalPrecio === newChange.newPrecio) {
          updatedChanges.splice(existingChangeIndex, 1);
        }
        return updatedChanges;
      } else {
        if (newChange.originalPrecio !== newChange.newPrecio) {
          return [...prev, newChange];
        }
        return prev;
      }
    });
  };

  const updateTempProductPrice = (sku: string, precio: number) => {
    setTempSelectedProducts(prev => prev.map(p =>
      p.sku === sku ? { ...p, precioUnitario: precio } : p
    ));
  };

  const handleUpdateSale = async () => {
    if (changes.length === 0 && precioChanges.length === 0) {
      toast({
        title: "Sin cambios",
        description: "No hay cambios para actualizar."
      });
      return;
    }

    if (!venta) {
      toast({
        title: "Error",
        description: "No se encontró la venta para actualizar",
        variant: "destructive"
      });
      return;
    }

    try {
      // Update each quantity change in ventas_detalle table
      for (const change of changes) {
        const detalle = detalles.find(d => d.id === change.id);
        if (!detalle) continue;

        const newSubtotalLinea = change.newCantidad * detalle.precio_unitario;

        const { error } = await supabase
          .from('ventas_detalle')
          .update({
            cantidad: change.newCantidad,
            subtotal_linea: newSubtotalLinea
          })
          .eq('id', change.id);

        if (error) {
          console.error('Error updating item:', error);
          toast({
            title: "Error",
            description: "Hubo un error al actualizar la venta.",
            variant: "destructive"
          });
          return;
        }
      }

      // Update each price change in ventas_detalle table
      for (const change of precioChanges) {
        const detalle = detalles.find(d => d.id === change.id);
        if (!detalle) continue;

        const newSubtotalLinea = detalle.cantidad * change.newPrecio;

        const { error } = await supabase
          .from('ventas_detalle')
          .update({
            precio_unitario: change.newPrecio,
            valor_unitario: (detalle.cantidad * change.newPrecio) / 1.18, // O.P. Gravada línea
            subtotal_linea: detalle.cantidad * change.newPrecio // Total línea
          })
          .eq('id', change.id);

        if (error) {
          console.error('Error updating price:', error);
          toast({
            title: "Error",
            description: "Hubo un error al actualizar el precio.",
            variant: "destructive"
          });
          return;
        }
      }

      // Recalculate totals based on updated values
      const newTotal = detalles.reduce((sum, detalle) => {
        const change = changes.find(c => c.id === detalle.id);
        const cantidad = change ? change.newCantidad : detalle.cantidad;
        const precioChange = precioChanges.find(c => c.id === detalle.id);
        const precio = precioChange ? precioChange.newPrecio : detalle.precio_unitario;
        return sum + (cantidad * precio);
      }, 0);

      const newOpGravada = newTotal / 1.18;
      const newIgv = newTotal - newOpGravada;

      // Update venta totals
      const { error: updateVentaError } = await supabase
        .from('ventas')
        .update({ 
          subtotal: newOpGravada, // Store O.P. Gravada in subtotal field
          igv: newIgv,
          total: newTotal 
        })
        .eq('id', venta.id);

      if (updateVentaError) {
        console.error('Error updating venta total:', updateVentaError);
      }

      // Reasignar bins con sistema de 2 estados (reservado)
      console.log('🔵 Reasignando bins (sistema 2 estados - reservado)...');
      const { data: reassignResult, error: reassignError } = await supabase.rpc('assign_bins_to_sale_v2', {
        sale_id: venta.id
      });

      if (reassignError) {
        console.error('❌ Error al reasignar stock:', reassignError);
        toast({
          title: "Error crítico",
          description: `No se pudo reasignar stock: ${reassignError.message}`,
          variant: "destructive"
        });
        return;
      }

      // Verificar resultado (type cast for JSON response)
      const result = reassignResult as any;
      if (!result || !result.success) {
        console.error('❌ Reasignación fallida:', result);
        
        let errorMessage = 'No se pudo completar la reasignación.\n';
        
        if (result?.frozen_products?.length > 0) {
          errorMessage += `\nProductos congelados: ${result.frozen_products.length}`;
        }
        
        if (result?.insufficient_stock?.length > 0) {
          errorMessage += `\nStock insuficiente: ${result.insufficient_stock.length}`;
        }
        
        toast({
          title: "Reasignación fallida",
          description: errorMessage,
          variant: "destructive"
        });
        return;
      }

      console.log(`✅ Reasignación exitosa: ${result.total_assigned} unidades`);

      toast({
        title: "Venta actualizada",
        description: "Las cantidades han sido actualizadas y el stock reasignado exitosamente."
      });

      // Clear changes
      setChanges([]);
      setPrecioChanges([]);

      // Navigate back
      const decodedOrderId = decodeURIComponent(orderId || '');
      navigate(`/orders/sale/${encodeURIComponent(decodedOrderId)}`);
    } catch (error) {
      console.error('Error updating sale:', error);
      toast({
        title: "Error",
        description: "Hubo un error al actualizar la venta.",
        variant: "destructive"
      });
    }
  };

  const fetchVentaAndDetails = async () => {
    if (!orderId) return;
    
    const decodedOrderId = decodeURIComponent(orderId);
    
    try {
      console.log('EditSale - Loading venta:', decodedOrderId);
      
      // Fetch venta data
      const { data: ventaData, error: ventaError } = await supabase
        .from('ventas')
        .select('*')
        .eq('venta_id', decodedOrderId)
        .single();
      
      if (ventaError) {
        console.error('Error fetching venta:', ventaError);
        setVenta(null);
        setDetalles([]);
        return;
      }
      
      if (!ventaData) {
        console.log('No venta found:', decodedOrderId);
        setVenta(null);
        setDetalles([]);
        return;
      }
      
      setVenta(ventaData);
      
      // Fetch venta details
      const { data: detallesData, error: detallesError } = await supabase
        .from('ventas_detalle')
        .select('*')
        .eq('venta_id', ventaData.id);
      
      if (detallesError) {
        console.error('Error fetching detalles:', detallesError);
        setDetalles([]);
        return;
      }
      
      setDetalles(detallesData || []);
      
      // Fetch available stock for each SKU in the sale
      if (detallesData && detallesData.length > 0) {
        const skus = [...new Set(detallesData.map((d: any) => d.sku))];
        const { data: stockData, error: stockError } = await supabase
          .from('stockxbin')
          .select('sku, disponibles, comprometido')
          .in('sku', skus);

        if (stockError) {
          console.error('Error fetching stock:', stockError);
        } else {
          // Calculate total available stock per SKU (disponibles + comprometido from this sale)
          const stockBySku: Record<string, number> = {};
          
          for (const sku of skus) {
            const stockRecords = stockData?.filter(s => s.sku === sku) || [];
            const totalDisponibles = stockRecords.reduce((sum, s) => sum + (s.disponibles || 0), 0);
            
            // Add the current committed quantity for this sale to available stock
            const currentCommitted = detallesData
              .filter((d: any) => d.sku === sku)
              .reduce((sum: number, d: any) => sum + d.cantidad, 0);
            
            stockBySku[sku] = totalDisponibles + currentCommitted;
          }
          
          setStockAvailable(stockBySku);
        }
      }
      
      console.log('EditSale - Venta loaded:', ventaData);
      console.log('EditSale - Detalles loaded:', detallesData);
      
    } catch (error) {
      console.error('Error fetching data:', error);
      setVenta(null);
      setDetalles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVentaAndDetails();
  }, [orderId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Cargando...</h2>
          <p className="text-muted-foreground">Cargando información de la venta...</p>
        </div>
        <Card className="p-6 bg-card border-border">
          <div className="text-center text-muted-foreground">Cargando...</div>
        </Card>
      </div>
    );
  }

  if (!venta) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={handleBack} className="p-2">
            <ChevronLeft size={20} />
          </Button>
          <h2 className="text-xl font-semibold text-foreground">Venta no encontrada</h2>
        </div>
        <Card className="p-6 bg-card border-border">
          <div className="text-center text-muted-foreground">No se pudo encontrar la venta solicitada.</div>
        </Card>
      </div>
    );
  }

  // Check if document has been emitted
  const documentEmitted = !!(venta.url_public_view || venta.id_bsale_documento);
  
  if (documentEmitted) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={handleBack} className="p-2">
            <ChevronLeft size={20} />
          </Button>
          <h2 className="text-xl font-semibold text-foreground">No se puede editar esta venta</h2>
        </div>
        <Card className="p-6 bg-card border-border">
          <div className="text-center space-y-2">
            <p className="text-muted-foreground">Esta venta ya tiene un documento emitido y no puede ser editada.</p>
            {venta.documento_tipo && (
              <p className="text-sm text-muted-foreground">Documento emitido: {venta.documento_tipo.toUpperCase()}</p>
            )}
            {venta.serial_number && (
              <p className="text-sm text-muted-foreground">Número de serie: {venta.serial_number}</p>
            )}
          </div>
        </Card>
      </div>
    );
  }

  const clienteInfo = venta.cliente_info || {};
  const clienteNombre = clienteInfo.nombre || 
    (clienteInfo.firstName && clienteInfo.lastName ? `${clienteInfo.firstName} ${clienteInfo.lastName}` : '') ||
    clienteInfo.razonSocial || 'Cliente sin nombre';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={handleBack} className="p-2">
            <ChevronLeft size={20} />
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">Editar Venta {venta.venta_id}</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={openSearchDialog}>
            <Plus className="w-4 h-4 mr-2" />
            Agregar productos
          </Button>
          {(changes.length > 0 || precioChanges.length > 0) && (
            <Button onClick={handleUpdateSale}>
              Actualizar venta
            </Button>
          )}
          <div className="bg-muted rounded-lg px-4 py-2">
            <p className="text-sm text-muted-foreground">Cliente</p>
            <p className="font-medium text-foreground">{clienteNombre}</p>
          </div>
        </div>
      </div>

      {/* Sale details table */}
      <Card className="p-6 bg-card border-border">
        <h3 className="text-lg font-semibold text-foreground mb-4">Productos de la Venta</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 text-sm font-medium text-muted-foreground">Producto</th>
                <th className="text-left py-3 text-sm font-medium text-muted-foreground">SKU</th>
                <th className="text-center py-3 text-sm font-medium text-muted-foreground">Stock</th>
                <th className="text-center py-3 text-sm font-medium text-muted-foreground">Cantidad</th>
                <th className="text-right py-3 text-sm font-medium text-muted-foreground">Precio Unit.</th>
                <th className="text-right py-3 text-sm font-medium text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {detalles.map((detalle) => (
                <tr key={detalle.id} className="border-b border-border/50">
                  <td className="py-4">
                    <div>
                      <div className="font-medium text-foreground">{detalle.nombre_producto}</div>
                      {detalle.variante && (
                        <div className="inline-block bg-muted rounded px-2 py-1 text-xs text-muted-foreground mt-1">
                          {detalle.variante}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="py-4 text-foreground font-mono">{detalle.sku}</td>
                  <td className="py-4 text-center">
                    <span className="text-sm text-muted-foreground">
                      {stockAvailable[detalle.sku] || 0} disponibles
                    </span>
                  </td>
                  <td className="py-4">
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => handleCantidadChange(detalle.id, detalle.cantidad - 1)}
                        disabled={detalle.cantidad <= 0}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Input
                        type="number"
                        value={detalle.cantidad}
                        onChange={(e) => handleCantidadChange(detalle.id, parseInt(e.target.value) || 0)}
                        className="w-20 text-center"
                        min="0"
                        max={stockAvailable[detalle.sku] || 0}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => handleCantidadChange(detalle.id, detalle.cantidad + 1)}
                        disabled={detalle.cantidad >= (stockAvailable[detalle.sku] || 0)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                   <td className="py-4 text-right">
                     <Input
                       type="number"
                       value={detalle.precio_unitario}
                       onChange={(e) => handlePrecioChange(detalle.id, parseFloat(e.target.value) || 0)}
                       className="w-24 text-right"
                       min="0"
                       step="0.01"
                     />
                   </td>
                  <td className="py-4 text-right text-foreground font-medium">
                    S/ {detalle.subtotal_linea.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Totals */}
        <div className="mt-6 border-t border-border pt-4">
          <div className="flex justify-end">
            <div className="w-64 space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">O.P. Gravada:</span>
                <span className="text-foreground">S/ {venta.subtotal?.toFixed(2) || "0.00"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">IGV (18%):</span>
                <span className="text-foreground">S/ {venta.igv?.toFixed(2) || "0.00"}</span>
              </div>
              <div className="flex justify-between font-semibold text-lg">
                <span className="text-foreground">Total:</span>
                <span className="text-foreground">S/ {venta.total?.toFixed(2) || "0.00"}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Product selection dialog */}
      <Dialog open={isSearchOpen} onOpenChange={setIsSearchOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Agregar productos a la venta</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Buscar productos por nombre, SKU o variante..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="max-h-96 overflow-y-auto">
              <div className="grid gap-2">
                {filteredProducts.map(product => (
                  <div key={product.sku} className="flex items-center justify-between p-3 border border-border rounded-lg">
                    <div className="flex-1">
                      <h4 className="font-medium text-foreground">{product.nombreProducto}</h4>
                      {product.variante && (
                        <span className="text-sm text-muted-foreground">{product.variante}</span>
                      )}
                       <div className="flex items-center gap-2 mt-1">
                         <span className="text-sm text-muted-foreground">SKU: {product.sku}</span>
                         <span className="text-sm text-muted-foreground">Stock: {product.totalDisponibles}</span>
                       </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getTempSelectedQuantity(product.sku) > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeFromTempOrder(product.sku)}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                      )}
                      {getTempSelectedQuantity(product.sku) > 0 && (
                        <span className="text-sm font-medium min-w-[2rem] text-center">
                          {getTempSelectedQuantity(product.sku)}
                        </span>
                      )}
                      <Button
                        variant={getTempSelectedQuantity(product.sku) > 0 ? "default" : "outline"}
                        size="sm"
                        onClick={() => addToTempOrder(product)}
                        disabled={getTempSelectedQuantity(product.sku) >= product.totalDisponibles}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {tempSelectedProducts.length > 0 && (
              <div className="border-t border-border pt-4">
                <h4 className="font-medium text-foreground mb-2">Productos seleccionados:</h4>
                <div className="space-y-3">
                  {tempSelectedProducts.map(product => (
                    <div key={product.sku} className="flex justify-between items-center gap-4 p-3 bg-muted rounded-lg">
                      <div className="flex-1">
                        <span className="text-foreground font-medium">{product.nombreProducto}</span>
                        {product.variante && <span className="text-muted-foreground"> ({product.variante})</span>}
                        <div className="text-sm text-muted-foreground">
                          {product.cantidadSeleccionada} unidades
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-muted-foreground">Precio:</label>
                        <Input
                          type="number"
                          value={product.precioUnitario}
                          onChange={(e) => updateTempProductPrice(product.sku, parseFloat(e.target.value) || 0)}
                          className="w-24 text-right"
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={cancelSelection}>
              Cancelar
            </Button>
            <Button 
              onClick={confirmSelection}
              disabled={tempSelectedProducts.length === 0}
            >
              Agregar productos ({tempSelectedProducts.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}