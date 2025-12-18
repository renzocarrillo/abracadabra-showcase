import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, FileText, Download, Package, MapPin, User, Clock, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { printTransferLabel } from '@/lib/printTransferLabel';

interface PedidoArchivado {
  id: string;
  pedido_id: string;
  tipo: string;
  tienda_nombre: string;
  total_items: number;
  unique_products?: number;
  estado: string;
  created_at: string;
  updated_at: string;
  created_by_name?: string | null;
  eliminado_por_usuario_nombre?: string | null;
  fecha_eliminacion?: string | null;
  motivo_eliminacion?: string | null;
  es_venta?: boolean;
  es_picking_libre?: boolean;
  cliente_info?: Record<string, any> | null;
  url_public_view?: string | null;
  url_guia_remision?: string | null;
  guia_remision?: boolean;
  requiere_guia_remision?: boolean;
  documento_tipo?: string | null;
  serial_number?: string | null;
  id_bsale_documento?: number | null;
  notes?: string | null;
}

interface PickingDetail {
  id: string;
  sku: string;
  nombre_producto: string;
  variante: string | null;
  cantidad_asignada: number;
  bin: string;
  created_at: string;
}

interface TrasladoInfo {
  id: string;
  document_number: number;
  url_public_view: string | null;
  created_at: string;
}

export default function ArchivedOrderDetails() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [pedido, setPedido] = useState<PedidoArchivado | null>(null);
  const [pickingDetails, setPickingDetails] = useState<PickingDetail[]>([]);
  const [trasladoInfo, setTrasladoInfo] = useState<TrasladoInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) {
      navigate('/orders/archived');
      return;
    }
    
    fetchOrderDetails();
  }, [orderId]);

  const fetchOrderDetails = async () => {
    try {
      setLoading(true);
      let itemData: any = null;
      let isVenta = false;
      let isPickingLibre = false;
      
      // First try picking_libre_sessions by UUID (when user navigates with the ID from picking libre)
      const { data: pickingLibreData, error: pickingLibreError } = await supabase
        .from('picking_libre_sessions')
        .select(`
          *,
          tiendas:tienda_destino_id (
            nombre
          )
        `)
        .eq('id', orderId)
        .eq('status', 'completado')
        .maybeSingle();
      
      if (pickingLibreData) {
        const sessionCode = `PL-${pickingLibreData.id.substring(0, 8).toUpperCase()}`;
        const tiendaNombre = pickingLibreData.tiendas?.nombre || 'Sin tienda';
        
        // Get Bsale document number from picking_libre_emissions
        const { data: emissionData } = await supabase
          .from('picking_libre_emissions')
          .select('response_payload')
          .eq('session_id', pickingLibreData.id)
          .eq('status', 'completed')
          .maybeSingle();
        
        // Extract guide number from response payload
        let bsaleDocNumber: string | undefined = undefined;
        if (emissionData?.response_payload) {
          const payload = emissionData.response_payload as any;
          const guideNumber = payload?.guide?.number;
          if (guideNumber !== null && guideNumber !== undefined) {
            bsaleDocNumber = String(guideNumber);
          }
        }
        
        itemData = {
          id: pickingLibreData.id,
          pedido_id: sessionCode,
          tipo: 'Picking Libre',
          tienda_nombre: tiendaNombre,
          total_items: pickingLibreData.total_items || 0,
          unique_products: pickingLibreData.unique_products || 0,
          estado: 'archivado',
          created_at: pickingLibreData.created_at,
          updated_at: pickingLibreData.completed_at || pickingLibreData.updated_at,
          eliminado_por_usuario_nombre: null,
          es_venta: false,
          es_picking_libre: true,
          created_by_name: pickingLibreData.created_by_name,
          url_public_view: pickingLibreData.url_public_view,
          documento_tipo: pickingLibreData.documento_tipo,
          serial_number: bsaleDocNumber,
          notes: pickingLibreData.notes,
          productos_retirados_por: pickingLibreData.productos_retirados_por,
          tipo_movimiento: pickingLibreData.tipo_movimiento
        };
        isPickingLibre = true;
      } else {
        // Try pedidos
        const { data: pedidoData, error: pedidoError } = await supabase
          .from('pedidos')
          .select('*')
          .eq('pedido_id', orderId)
          .eq('estado', 'archivado')
          .maybeSingle();
        
        if (pedidoData) {
          itemData = pedidoData;
          itemData.es_venta = false;
          itemData.es_picking_libre = false;
        } else {
          // Try ventas
          const { data: ventaData, error: ventaError } = await supabase
            .from('ventas')
            .select('*')
            .eq('venta_id', orderId)
            .eq('estado', 'archivado')
            .maybeSingle();
        
          if (ventaData) {
            // Map venta data
            const clienteInfo = ventaData.cliente_info as Record<string, any> || {};
            
            let clienteNombre = 'Cliente sin nombre';
            if (clienteInfo.nombre && String(clienteInfo.nombre).trim()) {
              clienteNombre = String(clienteInfo.nombre);
            } else if (clienteInfo.firstName || clienteInfo.lastName) {
              const firstName = String(clienteInfo.firstName || '');
              const lastName = String(clienteInfo.lastName || '');
              clienteNombre = `${firstName} ${lastName}`.trim();
            } else if (clienteInfo.razonSocial && String(clienteInfo.razonSocial).trim()) {
              clienteNombre = String(clienteInfo.razonSocial);
            }

            // Get total items from ventas_detalle
            const { data: detallesData } = await supabase
              .from('ventas_detalle')
              .select('cantidad')
              .eq('venta_id', ventaData.id);
            
            const totalItems = detallesData?.reduce((sum, detalle) => sum + detalle.cantidad, 0) || 0;
            
            itemData = {
              id: ventaData.id,
              pedido_id: ventaData.venta_id,
              tipo: 'Venta',
              tienda_nombre: clienteNombre,
              total_items: totalItems,
              estado: ventaData.estado,
              created_at: ventaData.created_at,
              updated_at: ventaData.updated_at,
              eliminado_por_usuario_nombre: ventaData.eliminado_por_usuario_nombre,
              fecha_eliminacion: ventaData.fecha_eliminacion,
              motivo_eliminacion: ventaData.motivo_eliminacion,
              es_venta: true,
              es_picking_libre: false,
              created_by_name: null,
              cliente_info: ventaData.cliente_info,
              url_public_view: ventaData.url_public_view,
              url_guia_remision: ventaData.url_guia_remision,
              guia_remision: ventaData.guia_remision || false,
              requiere_guia_remision: ventaData.requiere_guia_remision || false,
              documento_tipo: ventaData.documento_tipo,
              serial_number: ventaData.serial_number
            };
            isVenta = true;
          }
        }
      }
      
      if (!itemData) {
        toast({
          title: "Error",
          description: "No se encontró el pedido o venta archivada",
          variant: "destructive"
        });
        navigate('/orders/archived');
        return;
      }
      
      setPedido(itemData);
      
      // Get picking details based on type
      let pickingData: any[] = [];
      
      if (isPickingLibre) {
        // For picking libre, use picking_libre_items
        const { data, error: pickingError } = await supabase
          .from('picking_libre_items')
          .select('id, sku, nombre_producto, variante, quantity, bin_code, scanned_at')
          .eq('session_id', itemData.id);
        
        if (!pickingError && data) {
          pickingData = data.map(item => ({
            id: item.id,
            sku: item.sku,
            nombre_producto: item.nombre_producto,
            variante: item.variante,
            cantidad_asignada: item.quantity,
            bin: item.bin_code,
            created_at: item.scanned_at
          }));
        }
      } else if (isVenta) {
        // For ventas, use ventas_asignaciones
        const { data, error: pickingError } = await supabase
          .from('ventas_asignaciones')
          .select(`
            id,
            sku,
            bin,
            cantidad_asignada,
            created_at,
            ventas_detalle!inner(
              nombre_producto,
              variante
            )
          `)
          .eq('venta_id', itemData.id);
        
        if (!pickingError && data) {
          pickingData = data.map(item => ({
            id: item.id,
            sku: item.sku,
            nombre_producto: item.ventas_detalle.nombre_producto,
            variante: item.ventas_detalle.variante,
            cantidad_asignada: item.cantidad_asignada,
            bin: item.bin,
            created_at: item.created_at
          }));
        }

        // Fallback: if no assignments, show at least sales details
        if (pickingData.length === 0) {
          const { data: detallesVenta } = await supabase
            .from('ventas_detalle')
            .select('sku, nombre_producto, variante, cantidad, created_at')
            .eq('venta_id', itemData.id);
          if (detallesVenta) {
            pickingData = detallesVenta.map((d: any, idx: number) => ({
              id: `venta-${idx}-${d.sku}`,
              sku: d.sku,
              nombre_producto: d.nombre_producto,
              variante: d.variante,
              cantidad_asignada: d.cantidad,
              bin: 'N/A',
              created_at: d.created_at || itemData.created_at
            }));
          }
        }
      } else {
        // For pedidos, get assignments and enrich with product info
        const { data: asigs, error: asigError } = await supabase
          .from('pedidos_asignaciones')
          .select('id, sku, bin, cantidad_asignada, created_at, pedido_detalle_id')
          .eq('pedido_id', itemData.id);

        if (asigError) {
          console.error('Error fetching picking assignments:', asigError);
        }

        if (asigs && asigs.length > 0) {
          // Try to enrich with product names
          const detalleIds = asigs.map(a => a.pedido_detalle_id).filter(Boolean);
          let nombrePorDetalle: Record<string, { nombre_producto: string; variante: string | null }> = {};

          if (detalleIds.length > 0) {
            const { data: detallesData } = await supabase
              .from('pedidos_detalle')
              .select('id, nombre_producto, variante')
              .in('id', detalleIds as any);
            if (detallesData) {
              nombrePorDetalle = detallesData.reduce((acc: any, d: any) => {
                acc[d.id] = { nombre_producto: d.nombre_producto, variante: d.variante };
                return acc;
              }, {});
            }
          }

          pickingData = asigs.map(a => ({
            id: a.id,
            sku: a.sku,
            nombre_producto: nombrePorDetalle[a.pedido_detalle_id]?.nombre_producto || 'Producto',
            variante: nombrePorDetalle[a.pedido_detalle_id]?.variante || null,
            cantidad_asignada: a.cantidad_asignada,
            bin: a.bin || 'N/A',
            created_at: a.created_at
          }));
        } else {
          // Fallback: if no assignments, show at least order details
          const { data: fallbackData } = await supabase
            .from('pedidos_detalle')
            .select('sku, nombre_producto, variante, cantidad_asignada, created_at')
            .eq('pedido_id', itemData.id);
          
          if (fallbackData) {
            pickingData = fallbackData.map((item: any, idx: number) => ({
              id: `fallback-${idx}-${item.sku}`,
              sku: item.sku,
              nombre_producto: item.nombre_producto,
              variante: item.variante,
              cantidad_asignada: item.cantidad_asignada || 0,
              bin: 'N/A',
              created_at: item.created_at || itemData.created_at
            }));
          }
        }
      }
      
      setPickingDetails(pickingData);
      
      // Get traslado info (only for non-deleted pedidos)
      if (!itemData.eliminado_por_usuario_nombre && !isVenta && !isPickingLibre) {
        const { data: trasladoData, error: trasladoError } = await supabase
          .from('traslados_internos')
          .select('id, document_number, url_public_view, created_at')
          .eq('pedido_id', itemData.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (!trasladoError && trasladoData) {
          setTrasladoInfo(trasladoData);
        }
      }
      
    } catch (error) {
      console.error('Error fetching order details:', error);
      toast({
        title: "Error",
        description: "Error al cargar los detalles del pedido",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return formatDistanceToNow(date, { addSuffix: true, locale: es });
    } catch (error) {
      return 'hace un momento';
    }
  };

  const formatDateTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return format(date, "dd/MM/yyyy 'a las' HH:mm", { locale: es });
    } catch (error) {
      return 'Fecha inválida';
    }
  };

  const openDocument = () => {
    if (trasladoInfo?.url_public_view) {
      window.open(trasladoInfo.url_public_view, '_blank');
    } else {
      toast({
        title: "Documento no disponible",
        description: "No se encontró el documento para este pedido",
        variant: "destructive"
      });
    }
  };

  const openBoletaDocument = () => {
    if (pedido?.url_public_view && pedido.url_public_view !== 'URL no disponible') {
      window.open(pedido.url_public_view, '_blank');
    } else {
      toast({
        title: "Documento no disponible",
        description: "No se encontró el documento para esta venta",
        variant: "destructive"
      });
    }
  };

  const openGuiaDocument = () => {
    if (pedido?.url_guia_remision && pedido.url_guia_remision !== 'URL no disponible') {
      window.open(pedido.url_guia_remision, '_blank');
    } else {
      toast({
        title: "Guía no disponible",
        description: "No se encontró la guía de remisión para esta venta",
        variant: "destructive"
      });
    }
  };

  const handlePrintLabel = async () => {
    if (!pedido || !pedido.es_picking_libre) return;
    
    // Parse picker info from notes if available
    let pickerName: string | undefined = undefined;
    let productosRetiradosPor: string | undefined = undefined;
    
    if (pedido.notes) {
      try {
        const notesData = JSON.parse(pedido.notes);
        pickerName = notesData.picker_name;
      } catch (e) {
        // Notes is not JSON or doesn't have picker_name
      }
    }
    
    // Get productos_retirados_por and tipo_movimiento if available
    if ((pedido as any).productos_retirados_por) {
      productosRetiradosPor = (pedido as any).productos_retirados_por;
    }
    
    const tipoMovimiento = (pedido as any).tipo_movimiento;
    
    const success = await printTransferLabel({
      sessionId: pedido.id,
      completedAt: pedido.updated_at,
      createdByName: pedido.created_by_name || 'Usuario',
      pickerName: pickerName,
      destinationStore: pedido.tienda_nombre,
      bsaleDocumentNumber: pedido.serial_number || undefined,
      productosRetiradosPor: productosRetiradosPor,
      tipoMovimiento: tipoMovimiento,
      totalItems: pedido.total_items
    });

    if (success) {
      toast({
        title: "Etiqueta lista",
        description: "La etiqueta se ha enviado a imprimir",
      });
    } else {
      toast({
        title: "Error al imprimir",
        description: "No se pudo generar la etiqueta de transferencia",
        variant: "destructive"
      });
    }
  };

  const groupedPickingDetails = pickingDetails.reduce((acc, item) => {
    const key = `${item.sku}-${item.nombre_producto}`;
    if (!acc[key]) {
      acc[key] = {
        sku: item.sku,
        nombre_producto: item.nombre_producto,
        variante: item.variante,
        bins: {}
      };
    }
    
    // Group by bin and sum quantities
    const binKey = item.bin;
    if (!acc[key].bins[binKey]) {
      acc[key].bins[binKey] = {
        bin: item.bin,
        cantidad: 0,
        fecha: item.created_at
      };
    }
    acc[key].bins[binKey].cantidad += item.cantidad_asignada;
    
    // Keep the earliest date
    if (new Date(item.created_at) < new Date(acc[key].bins[binKey].fecha)) {
      acc[key].bins[binKey].fecha = item.created_at;
    }
    
    return acc;
  }, {} as Record<string, any>);
  
  // Convert bins object to array for easier rendering
  const groupedPickingDetailsArray = Object.values(groupedPickingDetails).map(product => ({
    ...product,
    bins: Object.values(product.bins)
  }));

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/orders/archived')}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Volver a Archivados
          </Button>
        </div>
        <Card className="p-6">
          <div className="text-center text-muted-foreground">Cargando detalles...</div>
        </Card>
      </div>
    );
  }

  if (!pedido) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/orders/archived')}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Volver a Archivados
          </Button>
        </div>
        <Card className="p-6">
          <div className="text-center text-muted-foreground">Pedido no encontrado</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/orders/archived')}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Volver
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{pedido.pedido_id}</h1>
            <p className="text-muted-foreground text-sm">
              {pedido.es_venta ? 'Venta' : pedido.es_picking_libre ? 'Picking Libre' : 'Pedido'} archivado
            </p>
          </div>
        </div>
        
        {/* Document buttons */}
        {pedido.es_venta && (
          <div className="flex gap-2">
            <Button 
              onClick={openBoletaDocument} 
              disabled={!pedido.url_public_view || pedido.url_public_view === 'URL no disponible'}
              className="gap-2"
              size="sm"
            >
              <Download className="h-4 w-4" />
              Documento
            </Button>
            
            <Button 
              onClick={openGuiaDocument}
              disabled={!pedido.guia_remision || !pedido.url_guia_remision || pedido.url_guia_remision === 'URL no disponible'}
              variant="outline" 
              className="gap-2"
              size="sm"
            >
              <Download className="h-4 w-4" />
              Guía
            </Button>
          </div>
        )}
        
        {!pedido.es_venta && !pedido.es_picking_libre && trasladoInfo?.url_public_view && !pedido.eliminado_por_usuario_nombre && (
          <Button onClick={openDocument} variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            Traslado
          </Button>
        )}

        {pedido.es_picking_libre && (
          <div className="flex gap-2">
            {pedido.url_public_view && (
              <Button 
                onClick={() => window.open(pedido.url_public_view!, '_blank')} 
                variant="outline" 
                size="sm" 
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Documento
              </Button>
            )}
            <Button 
              onClick={handlePrintLabel}
              variant="outline" 
              size="sm" 
              className="gap-2"
            >
              <Printer className="h-4 w-4" />
              Etiqueta
            </Button>
          </div>
        )}
      </div>

      {/* Order Info Card */}
      <Card className="p-6">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Tipo</div>
              <Badge variant={pedido.tipo === 'Web' ? 'default' : 'secondary'}>
                {pedido.tipo}
              </Badge>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">
                {pedido.es_venta ? 'Cliente' : 'Tienda Destino'}
              </div>
              <div className="font-medium text-foreground">{pedido.tienda_nombre}</div>
            </div>
            {pedido.es_picking_libre ? (
              <>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Productos únicos</div>
                  <div className="font-medium text-foreground">{pedido.unique_products || 0} SKUs</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Total unidades</div>
                  <div className="font-medium text-foreground">{pedido.total_items} unidades</div>
                </div>
              </>
            ) : (
              <div>
                <div className="text-sm text-muted-foreground mb-1">Total Items</div>
                <div className="font-medium text-foreground">{pedido.total_items} productos</div>
              </div>
            )}
            <div>
              <div className="text-sm text-muted-foreground mb-1">Estado</div>
              {pedido.eliminado_por_usuario_nombre ? (
                <Badge variant="destructive">
                  ✗ Eliminado
                </Badge>
              ) : (
                <Badge variant="outline" className="text-green-600 border-green-600">
                  ✓ Completado
                </Badge>
              )}
            </div>
            
            {pedido.es_venta && pedido.serial_number && (
              <div className="md:col-span-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                  <FileText className="h-5 w-5 text-primary" />
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Número de Serie del Documento</div>
                    <Badge variant="default" className="text-sm">{pedido.serial_number}</Badge>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-border">
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <div className="text-sm text-muted-foreground mb-1">Fecha de Creación</div>
                <div className="text-sm font-medium text-foreground">{formatDateTime(pedido.created_at)}</div>
                <div className="text-xs text-muted-foreground">{formatTimeAgo(pedido.created_at)}</div>
              </div>
            </div>

            {pedido.created_by_name && (
              <div className="flex items-start gap-3">
                <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Creado por</div>
                  <div className="text-sm font-medium text-foreground">{pedido.created_by_name}</div>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <div className="text-sm text-muted-foreground mb-1">
                  {pedido.eliminado_por_usuario_nombre ? 'Fecha de Eliminación' : 'Fecha de Creación'}
                </div>
                <div className="text-sm font-medium text-foreground">{formatDateTime(pedido.created_at)}</div>
                <div className="text-xs text-muted-foreground">{formatTimeAgo(pedido.created_at)}</div>
              </div>
            </div>
          </div>

          {trasladoInfo && (
            <div className="pt-4 border-t border-border">
              <div className="text-sm text-muted-foreground mb-1">Documento de Traslado Nº</div>
              <div className="text-lg font-semibold text-foreground">{trasladoInfo.document_number}</div>
            </div>
          )}

          {pedido.eliminado_por_usuario_nombre && (
            <div className="mt-4 pt-4 border-t bg-destructive/5 rounded-lg p-4">
              <h3 className="text-sm font-medium text-destructive mb-2">Información de Eliminación</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Eliminado por:</span>
                  <span className="ml-2 font-medium text-foreground">{pedido.eliminado_por_usuario_nombre}</span>
                </div>
                {pedido.fecha_eliminacion && (
                  <div>
                    <span className="text-muted-foreground">Fecha:</span>
                    <span className="ml-2 font-medium text-foreground">{formatDateTime(pedido.fecha_eliminacion)}</span>
                  </div>
                )}
              </div>
              {pedido.motivo_eliminacion && (
                <div className="mt-2 text-sm">
                  <span className="text-muted-foreground">Motivo:</span>
                  <span className="ml-2 text-foreground">{pedido.motivo_eliminacion}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Picking Details */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <Package className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">Productos y Ubicaciones</h2>
        </div>
        
        {groupedPickingDetailsArray.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <p>No se encontraron detalles de productos para este pedido</p>
            <Button onClick={fetchOrderDetails} variant="outline" className="mt-3" size="sm">
              Reintentar
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedPickingDetailsArray.map((product: any, index) => (
              <Card key={index} className="p-4 bg-muted/50 border-border">
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <div className="font-medium text-foreground mb-1">
                      {product.nombre_producto}
                    </div>
                    <div className="text-sm text-muted-foreground mb-3">
                      SKU: <span className="font-mono">{product.sku}</span>
                      {product.variante && ` • ${product.variante}`}
                    </div>
                    
                    {/* Bins info */}
                    <div className="space-y-2">
                      {product.bins.map((binInfo: any, binIndex: number) => (
                        <div key={binIndex} className="flex items-center gap-3 text-sm bg-background/50 rounded p-2">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            <span className="font-medium text-foreground">Bin: {binInfo.bin}</span>
                          </div>
                          <span className="text-muted-foreground">•</span>
                          <span className="text-foreground">{binInfo.cantidad} unidades</span>
                          <span className="text-muted-foreground">•</span>
                          <span className="text-muted-foreground text-xs">
                            {formatTimeAgo(binInfo.fecha)}
                          </span>
                        </div>
                      ))}
                    </div>
                    
                    <div className="mt-3 pt-3 border-t border-border">
                      <span className="text-sm font-semibold text-foreground">
                        Total: {product.bins.reduce((sum: number, bin: any) => sum + bin.cantidad, 0)} unidades
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>

      {/* Document Info for Sales */}
      {pedido.es_venta && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-foreground">Información del Documento</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Tipo de Documento</div>
              <div className="font-medium text-foreground">{pedido.documento_tipo || 'Boleta'}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Guía de Remisión</div>
              <Badge variant={pedido.guia_remision ? "default" : "secondary"}>
                {pedido.guia_remision ? "✓ Emitida" : "No emitida"}
              </Badge>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
