import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Archive, FileText, Eye, ExternalLink, FileSignature } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import OrderSignatureModal from '@/components/OrderSignatureModal';
import { useOrderSignatures } from '@/hooks/useOrderSignatures';
import { printSignatureTicket } from '@/lib/printSignatureTicket';

interface PedidoArchivado {
  id: string;
  pedido_id: string;
  tipo: string;
  tienda: string;
  cantidad: number;
  fecha_creacion: string;
  fecha_archivado: string;
  eliminado?: boolean;
  eliminado_por?: string;
  fecha_eliminacion?: string;
  url_public_view?: string;
  guide_url?: string;
  documento_tipo?: string;
  created_by_name?: string;
  serial_number?: string;
  notes?: string | null;
}

export default function ArchivedOrders() {
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState<PedidoArchivado[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [selectedOrderForSignature, setSelectedOrderForSignature] = useState<{
    id: string;
    code: string;
    type: 'pedido' | 'venta' | 'picking_libre';
  } | null>(null);
  const { signatures, getSignatureForOrder } = useOrderSignatures();

  useEffect(() => {
    async function fetchArchivedPedidosYVentas() {
      try {
        console.log('Fetching archived orders and sales...');
        
        // Fetch pedidos archivados
        const { data: pedidosData, error: pedidosError } = await supabase
          .from('pedidos')
          .select('*')
          .eq('estado', 'archivado')
          .order('updated_at', { ascending: false });
        
        // Fetch ventas archivadas
        const { data: ventasData, error: ventasError } = await supabase
          .from('ventas')
          .select(`
            *,
            ventas_detalle(cantidad)
          `)
          .eq('estado', 'archivado')
          .order('updated_at', { ascending: false });

        // Fetch completed picking libre sessions
        const { data: pickingLibreData, error: pickingLibreError } = await supabase
          .from('picking_libre_sessions')
          .select(`
            *,
            tiendas:tienda_destino_id (
              nombre,
              id
            )
          `)
          .eq('status', 'completado')
          .order('completed_at', { ascending: false });
        
        console.log('Archived pedidos data:', pedidosData);
        console.log('Archived ventas data:', ventasData);
        console.log('Archived picking libre data:', pickingLibreData);
        console.log('Pedidos Error:', pedidosError);
        console.log('Ventas Error:', ventasError);
        console.log('Picking Libre Error:', pickingLibreError);
        
        if (pedidosError) {
          console.error('Error fetching archived pedidos:', pedidosError);
        }
        
        if (ventasError) {
          console.error('Error fetching archived ventas:', ventasError);
        }

        if (pickingLibreError) {
          console.error('Error fetching archived picking libre sessions:', pickingLibreError);
        }
        
        // Mapear los datos de pedidos archivados
        const mappedPedidos = (pedidosData || []).map(item => ({
          id: item.id,
          pedido_id: item.pedido_id,
          tipo: item.tipo || 'Tienda',
          tienda: item.tienda_nombre || 'Sin tienda',
          cantidad: item.total_items || 0,
          fecha_creacion: item.created_at,
          fecha_archivado: item.updated_at,
          eliminado: !!item.eliminado_por_usuario_id,
          eliminado_por: item.eliminado_por_usuario_nombre,
          fecha_eliminacion: item.fecha_eliminacion,
          url_public_view: item.url_public_view,
          serial_number: item.serial_number
        }));
        
        // Mapear las ventas archivadas
        const mappedVentas = (ventasData || []).map(item => {
          const totalItems = item.ventas_detalle?.reduce((sum: number, detalle: any) => sum + detalle.cantidad, 0) || 0;
          const clienteInfo = typeof item.cliente_info === 'object' && item.cliente_info && !Array.isArray(item.cliente_info) ? item.cliente_info as any : {};
          
          // Construir nombre completo del cliente
          let clienteNombre = 'Cliente sin nombre';
          if (clienteInfo.nombre && clienteInfo.nombre.trim()) {
            clienteNombre = clienteInfo.nombre;
          } else if (clienteInfo.firstName || clienteInfo.lastName) {
            const firstName = clienteInfo.firstName || '';
            const lastName = clienteInfo.lastName || '';
            clienteNombre = `${firstName} ${lastName}`.trim();
          } else if (clienteInfo.razonSocial && clienteInfo.razonSocial.trim()) {
            clienteNombre = clienteInfo.razonSocial;
          }
          
          // Extract guide URL from notas if available
          let guideUrl = null;
          if (item.notas && item.notas.includes('URL:')) {
            const urlMatch = item.notas.match(/URL:\s*(https?:\/\/[^\s]+)/);
            if (urlMatch) {
              guideUrl = urlMatch[1];
            }
          }
          
          return {
            id: item.id,
            pedido_id: item.venta_id,
            tipo: 'Venta',
            tienda: clienteNombre,
            cantidad: totalItems,
            fecha_creacion: item.created_at,
            fecha_archivado: item.updated_at,
            eliminado: !!item.eliminado_por_usuario_id,
            eliminado_por: item.eliminado_por_usuario_nombre,
            fecha_eliminacion: item.fecha_eliminacion,
            url_public_view: item.url_public_view,
            guide_url: item.url_guia_remision || guideUrl,
            serial_number: item.serial_number,
            notes: item.notas
          };
        });
        
        // Map picking libre sessions
        const mappedPickingLibre = (pickingLibreData || []).map(item => {
          const tiendaNombre = item.tiendas?.nombre || 'Sin tienda';
          const sessionCode = `PL-${item.id.substring(0, 8).toUpperCase()}`;
          
          // Extract serial number from bsale_response if available
          let serialNumber = null;
          if (item.bsale_response && typeof item.bsale_response === 'object') {
            const response = item.bsale_response as any;
            // Try multiple possible locations for serialNumber in Bsale response
            serialNumber = response.serialNumber || 
                          response.number || 
                          response.guide?.serialNumber || 
                          response.guide?.number ||
                          null;
          }
          
          return {
            id: item.id,
            pedido_id: sessionCode,
            tipo: 'Picking Libre',
            tienda: tiendaNombre,
            cantidad: item.total_items || 0,
            fecha_creacion: item.created_at,
            fecha_archivado: item.completed_at || item.created_at,
            eliminado: false,
            url_public_view: item.url_public_view,
            documento_tipo: item.documento_tipo,
            created_by_name: item.created_by_name,
            serial_number: serialNumber,
            notes: item.notes,
            productos_retirados_por: item.productos_retirados_por,
            tipo_movimiento: item.tipo_movimiento
          };
        });

        // Combinar y ordenar por fecha de archivado
        const todosCombinados = [...mappedPedidos, ...mappedVentas, ...mappedPickingLibre]
          .sort((a, b) => new Date(b.fecha_archivado).getTime() - new Date(a.fecha_archivado).getTime());
        
        console.log('Final mapped archived data:', todosCombinados);
        setPedidos(todosCombinados);
      } catch (error) {
        console.error('Error fetching archived data:', error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchArchivedPedidosYVentas();
  }, []);

  const formatDateTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return format(date, "dd/MM/yyyy HH:mm");
    } catch (error) {
      return 'Fecha inválida';
    }
  };

  const viewTraslado = async (pedidoId: string) => {
    try {
      const pedidoFound = pedidos.find(p => p.pedido_id === pedidoId);
      if (!pedidoFound) return;
      
      // First check if the order already has url_public_view
      if (pedidoFound.url_public_view) {
        window.open(pedidoFound.url_public_view, '_blank');
        return;
      }
      
      // If not, look in traslados_internos table
      const { data: trasladoData, error } = await supabase
        .from('traslados_internos')
        .select('url_public_view')
        .eq('pedido_id', pedidoFound.id)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching traslado:', error);
        toast({
          title: "Error",
          description: "Error al acceder al documento",
          variant: "destructive"
        });
        return;
      }
      
      if (!trasladoData?.url_public_view) {
        toast({
          title: "Documento no disponible",
          description: "No se encontró el documento para este pedido",
          variant: "destructive"
        });
        return;
      }
      
      window.open(trasladoData.url_public_view, '_blank');
    } catch (error) {
      console.error('Error accessing document:', error);
      toast({
        title: "Error",
        description: "Error al acceder al documento",
        variant: "destructive"
      });
    }
  };

  const viewOrderDetails = (pedidoId: string) => {
    const pedido = pedidos.find(p => p.pedido_id === pedidoId);
    
    // Si es picking libre, usar el ID real en lugar del código
    if (pedido?.tipo === 'Picking Libre') {
      navigate(`/orders/archived/${pedido.id}/details`);
    } else {
      navigate(`/orders/archived/${pedidoId}/details`);
    }
  };

  const getOrderType = (tipo: string): 'pedido' | 'venta' | 'picking_libre' => {
    if (tipo === 'Venta') return 'venta';
    if (tipo === 'Picking Libre') return 'picking_libre';
    return 'pedido';
  };

  const handleViewSignature = (pedido: PedidoArchivado) => {
    const orderType = getOrderType(pedido.tipo);
    const signature = getSignatureForOrder(pedido.id, orderType);
    
    // Solo abrir si hay firma
    if (signature) {
      setSelectedOrderForSignature({
        id: pedido.id,
        code: pedido.pedido_id,
        type: orderType
      });
    }
  };

  const handlePrintSignature = async (pedido: PedidoArchivado) => {
    const orderType = getOrderType(pedido.tipo);
    const signature = getSignatureForOrder(pedido.id, orderType);
    
    if (!signature) {
      toast({
        title: "Sin firma",
        description: "Este pedido no tiene firma digital",
        variant: "destructive"
      });
      return;
    }

    // Determine document type label
    let documentTypeLabel: string | undefined;
    if (orderType === 'venta') {
      // For sales, use the actual document type (Boleta, Factura, etc.)
      documentTypeLabel = pedido.documento_tipo;
    } else if (pedido.documento_tipo === 'remision') {
      documentTypeLabel = 'Guía de Remisión';
    } else if (pedido.documento_tipo === 'traslado') {
      documentTypeLabel = 'Traslado Interno';
    }

    // Get the Bsale document number (serial_number)
    const bsaleDocumentNumber = pedido.serial_number || undefined;
    
    // Parse picker info from notes if available
    let preparedByName = pedido.created_by_name;
    let productosRetiradosPor: string | undefined = undefined;
    
    if (pedido.notes) {
      try {
        const notesData = JSON.parse(pedido.notes);
        if (notesData.picker_name) {
          preparedByName = notesData.picker_name;
        }
      } catch (e) {
        // Notes is not JSON or doesn't have picker_name, use created_by_name
      }
    }
    
    // Get productos_retirados_por if it's a picking libre order
    if ((pedido as any).productos_retirados_por) {
      productosRetiradosPor = (pedido as any).productos_retirados_por;
    }

    await printSignatureTicket({
      orderType: orderType,
      orderCode: pedido.pedido_id,
      destination: pedido.tienda,
      signerName: signature.signed_by_name,
      signedAt: signature.signed_at,
      documentType: documentTypeLabel,
      bsaleDocumentNumber: bsaleDocumentNumber,
      preparedBy: preparedByName,
      productosRetiradosPor: productosRetiradosPor
    });

    toast({
      title: "Impresión iniciada",
      description: "El ticket de firma se está imprimiendo"
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Archive className="h-6 w-6 text-muted-foreground" />
          <div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Pedidos Archivados</h2>
            <p className="text-muted-foreground">Pedidos que ya han sido procesados y tienen traslado interno emitido</p>
          </div>
        </div>
        <Card className="p-6 bg-card border-border">
          <div className="text-center text-muted-foreground">Cargando...</div>
        </Card>
      </div>
    );
  }

  if (pedidos.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Archive className="h-6 w-6 text-muted-foreground" />
          <div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Pedidos Archivados</h2>
            <p className="text-muted-foreground">Pedidos que ya han sido procesados y tienen traslado interno emitido</p>
          </div>
        </div>
        <Card className="p-6 bg-card border-border">
          <div className="text-center">
            <Archive className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No hay pedidos archivados</h3>
            <p className="text-muted-foreground">Los pedidos aparecerán aquí una vez que se emitan sus traslados internos</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3">
        <Archive className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground" />
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-foreground mb-2">Pedidos Archivados</h2>
          <p className="text-sm sm:text-base text-muted-foreground">Pedidos, ventas y sesiones de picking libre que han sido procesados y tienen documentos emitidos ({pedidos.length})</p>
        </div>
      </div>

      <Card className="p-3 sm:p-6 bg-card border-border">
        {/* Desktop Table View */}
        <div className="hidden lg:block overflow-hidden rounded-lg border border-border">
          <table className="w-full">
            <thead>
              <tr className="bg-table-header">
                <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Tipo</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Pedido</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Tienda</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Cantidad</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Documento</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Nº Serie/Boleta</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Archivado hace</th>
                <th className="px-6 py-4 text-right text-sm font-medium text-muted-foreground">Estado</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((pedido, index) => (
                <tr 
                  key={pedido.pedido_id}
                  className={`${index % 2 === 0 ? 'bg-table-row' : 'bg-table-header'} hover:bg-table-hover transition-colors`}
                >
                  <td className="px-6 py-4 text-sm text-foreground">
                    <span 
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        pedido.tipo === 'Web' 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : pedido.tipo === 'Picking Libre'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                          : pedido.tipo === 'Venta'
                          ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                      }`}
                    >
                      {pedido.tipo}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-foreground font-medium">{pedido.pedido_id}</td>
                  <td className="px-6 py-4 text-sm text-foreground">{pedido.tienda}</td>
                  <td className="px-6 py-4 text-sm text-foreground">{pedido.cantidad} Items</td>
                  <td className="px-6 py-4 text-sm text-foreground">
                    {pedido.documento_tipo === 'remision' 
                      ? '📋 Guía de Remisión' 
                      : pedido.documento_tipo === 'traslado'
                      ? '📦 Traslado Interno'
                      : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-foreground">
                    {pedido.tipo === 'Venta' && pedido.serial_number ? (
                      <Badge variant="secondary">{pedido.serial_number}</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-foreground">{formatDateTime(pedido.fecha_archivado)}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        pedido.eliminado 
                          ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                          : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      }`}>
                        {pedido.eliminado ? '✗ Eliminado' : '✓ Completado'}
                      </span>
                      {!pedido.eliminado && (
                        <>
                          {(() => {
                            const orderType = getOrderType(pedido.tipo);
                            const signature = getSignatureForOrder(pedido.id, orderType);
                            return signature ? (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handlePrintSignature(pedido)}
                                className="h-8 px-3"
                                title="Imprimir ticket de firma"
                              >
                                <FileSignature className="h-3 w-3" />
                              </Button>
                            ) : null;
                          })()}
                          {pedido.tipo === 'Picking Libre' ? (
                            <div className="flex gap-1">
                              {pedido.url_public_view && (
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => window.open(pedido.url_public_view, '_blank')}
                                  className="h-8 px-3"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                              )}
                              <Button 
                                variant="outline"
                                size="sm"
                                onClick={() => viewOrderDetails(pedido.pedido_id)}
                                className="h-8 px-3"
                              >
                                Ver
                              </Button>
                            </div>
                          ) : pedido.tipo === 'Venta' ? (
                            <div className="flex gap-1">
                              {pedido.url_public_view && (
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => window.open(pedido.url_public_view, '_blank')}
                                  className="h-8 px-3"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                              )}
                              <Button 
                                variant="outline"
                                size="sm"
                                onClick={() => viewOrderDetails(pedido.pedido_id)}
                                className="h-8 px-3"
                              >
                                Ver
                              </Button>
                            </div>
                          ) : (
                            <div className="flex gap-1">
                              {pedido.url_public_view && (
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => window.open(pedido.url_public_view, '_blank')}
                                  className="h-8 px-3"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                              )}
                              <Button 
                                variant="outline"
                                size="sm"
                                onClick={() => viewOrderDetails(pedido.pedido_id)}
                                className="h-8 px-3"
                              >
                                Ver detalles
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="lg:hidden space-y-3">
          {pedidos.map((pedido) => (
            <Card key={pedido.pedido_id} className="p-4 bg-card border-border">
              <div className="flex flex-col space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span 
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        pedido.tipo === 'Web' 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : pedido.tipo === 'Picking Libre'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                          : pedido.tipo === 'Venta'
                          ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                      }`}
                    >
                      {pedido.tipo}
                    </span>
                    <span className="text-sm font-medium text-foreground">{pedido.pedido_id}</span>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    pedido.eliminado 
                      ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                      : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                  }`}>
                    {pedido.eliminado ? '✗ Eliminado' : '✓ Completado'}
                  </span>
                </div>
                
                <div className="space-y-1">
                  <div className="text-sm text-foreground">
                    <span className="text-muted-foreground">Tienda: </span>
                    {pedido.tienda}
                  </div>
                  <div className="text-sm text-foreground">
                    <span className="text-muted-foreground">Cantidad: </span>
                    {pedido.cantidad} Items
                  </div>
                  {pedido.documento_tipo && (
                    <div className="text-sm text-foreground">
                      <span className="text-muted-foreground">Documento: </span>
                      {pedido.documento_tipo === 'remision' 
                        ? '📋 Guía de Remisión' 
                        : '📦 Traslado Interno'}
                    </div>
                  )}
                  {pedido.tipo === 'Venta' && pedido.serial_number && (
                    <div className="text-sm text-foreground">
                      <span className="text-muted-foreground">Nº Serie: </span>
                      <Badge variant="secondary" className="text-xs">{pedido.serial_number}</Badge>
                    </div>
                  )}
                  <div className="text-sm text-foreground">
                    <span className="text-muted-foreground">Archivado: </span>
                    {formatDateTime(pedido.fecha_archivado)}
                  </div>
                </div>
                
                {!pedido.eliminado && (
                  <div className="flex flex-col gap-2">
                    {(() => {
                      const orderType = getOrderType(pedido.tipo);
                      const signature = getSignatureForOrder(pedido.id, orderType);
                      return signature ? (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handlePrintSignature(pedido)}
                          className="flex-1"
                        >
                          <FileSignature className="h-4 w-4 mr-2" />
                          Imprimir Firma
                        </Button>
                      ) : null;
                    })()}
                    {pedido.tipo === 'Picking Libre' ? (
                      <div className="flex gap-2">
                        {pedido.url_public_view && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => window.open(pedido.url_public_view, '_blank')}
                            className="flex-1"
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Ver Documento
                          </Button>
                        )}
                        <Button 
                          variant="outline"
                          size="sm"
                          onClick={() => viewOrderDetails(pedido.pedido_id)}
                          className="flex-1"
                        >
                          Ver Detalles
                        </Button>
                      </div>
                    ) : pedido.tipo === 'Venta' ? (
                      <div className="flex gap-2">
                        {pedido.url_public_view && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => window.open(pedido.url_public_view, '_blank')}
                            className="flex-1"
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Ver Documento
                          </Button>
                        )}
                        <Button 
                          variant="outline"
                          size="sm"
                          onClick={() => viewOrderDetails(pedido.pedido_id)}
                          className="flex-1"
                        >
                          Ver Detalles
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        {pedido.url_public_view && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => window.open(pedido.url_public_view, '_blank')}
                            className="flex-1"
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Ver Documento
                          </Button>
                        )}
                        <Button 
                          variant="outline"
                          size="sm"
                          onClick={() => viewOrderDetails(pedido.pedido_id)}
                          className="flex-1"
                        >
                          Ver detalles
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      </Card>

      {selectedOrderForSignature && (
        <OrderSignatureModal
          open={true}
          onOpenChange={(open) => {
            if (!open) setSelectedOrderForSignature(null);
          }}
          orderCode={selectedOrderForSignature.code}
          orderType={selectedOrderForSignature.type}
          onSign={async () => false} // No se puede firmar desde aquí, solo ver
          signature={getSignatureForOrder(
            selectedOrderForSignature.id, 
            selectedOrderForSignature.type
          )}
        />
      )}
    </div>
  );
}