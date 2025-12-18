import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useOrderSignatures } from '@/hooks/useOrderSignatures';
import OrderSignatureModal from '@/components/OrderSignatureModal';
import OrderSignatureBadge from '@/components/OrderSignatureBadge';
import { Eye, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface CompletedOrder {
  id: string;
  pedido_id: string;
  tipo: string;
  tienda_nombre: string;
  total_items: number;
  created_at: string;
  updated_at: string;
  estado: string;
}

interface CompletedSale {
  id: string;
  venta_id: string;
  cliente_info: any;
  created_at: string;
  updated_at: string;
  estado: string;
  total_items: number;
}

interface CompletedPickingSession {
  id: string;
  created_by_name: string;
  completed_at: string;
  total_items: number;
  documento_tipo: string;
  notes?: string;
  tienda_destino_id?: string;
  tiendas?: {
    nombre: string;
  };
}

export default function CompletedOrders() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [completedOrders, setCompletedOrders] = useState<CompletedOrder[]>([]);
  const [completedSales, setCompletedSales] = useState<CompletedSale[]>([]);
  const [completedPickingSessions, setCompletedPickingSessions] = useState<CompletedPickingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<{
    id: string;
    code: string;
    type: 'pedido' | 'venta' | 'picking_libre';
  } | null>(null);

  const { 
    canSign, 
    getSignatureForOrder, 
    signOrder,
    refetch: refetchSignatures 
  } = useOrderSignatures();

  // Block access for picker and cabeza_de_tienda user types
  const userTypeName = profile?.user_types?.name;
  const isRestricted = userTypeName === 'picker' || userTypeName === 'cabeza_de_tienda';

  useEffect(() => {
    if (isRestricted) {
      navigate('/', { replace: true });
    }
  }, [isRestricted, navigate]);

  // Don't render content if user doesn't have access
  if (isRestricted) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="p-6 max-w-md">
          <div className="flex flex-col items-center gap-4 text-center">
            <ShieldAlert className="h-12 w-12 text-destructive" />
            <h2 className="text-xl font-semibold">Acceso Restringido</h2>
            <p className="text-muted-foreground">
              No tienes permisos para acceder a esta página.
            </p>
            <Button onClick={() => navigate('/')}>
              Volver al Inicio
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  useEffect(() => {
    fetchCompletedData();
  }, []);

  const fetchCompletedData = async () => {
    try {
      setLoading(true);
      
      // Fetch completed orders
      const { data: ordersData, error: ordersError } = await supabase
        .from('pedidos')
        .select('*')
        .eq('estado', 'archivado')
        .order('updated_at', { ascending: false })
        .limit(50);

      // Fetch completed sales with details
      const { data: salesData, error: salesError } = await supabase
        .from('ventas')
        .select(`
          *,
          ventas_detalle(cantidad)
        `)
        .eq('estado', 'archivado')
        .order('updated_at', { ascending: false })
        .limit(50);

      // Fetch completed picking libre sessions
      const { data: pickingData, error: pickingError } = await supabase
        .from('picking_libre_sessions')
        .select(`
          *,
          tiendas:tienda_destino_id(nombre)
        `)
        .eq('status', 'completado')
        .order('completed_at', { ascending: false })
        .limit(50);

      if (ordersError) throw ordersError;
      if (salesError) throw salesError;
      if (pickingError) throw pickingError;

      // Process sales data to calculate total items
      const processedSales = (salesData || []).map(sale => ({
        ...sale,
        total_items: Array.isArray(sale.ventas_detalle) 
          ? sale.ventas_detalle.reduce((sum, detail) => sum + (detail.cantidad || 0), 0)
          : 0
      }));

      setCompletedOrders(ordersData || []);
      setCompletedSales(processedSales);
      setCompletedPickingSessions(pickingData || []);
    } catch (error) {
      console.error('Error fetching completed data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOrder = async (notes?: string) => {
    if (!selectedOrder) return false;
    
    const success = await signOrder(
      selectedOrder.id,
      selectedOrder.type,
      selectedOrder.code,
      notes
    );
    
    if (success) {
      await refetchSignatures();
    }
    
    return success;
  };

  const formatTimeAgo = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: es });
    } catch {
      return 'hace un momento';
    }
  };

  const getClientName = (clienteInfo: any) => {
    if (!clienteInfo || typeof clienteInfo !== 'object') return 'Cliente sin nombre';
    
    if (clienteInfo.nombre && clienteInfo.nombre.trim()) return clienteInfo.nombre;
    
    if (clienteInfo.firstName || clienteInfo.lastName) {
      return `${clienteInfo.firstName || ''} ${clienteInfo.lastName || ''}`.trim();
    }
    
    if (clienteInfo.razonSocial && clienteInfo.razonSocial.trim()) {
      return clienteInfo.razonSocial;
    }
    
    return 'Cliente sin nombre';
  };

  const handleViewOrder = (orderUuid: string, orderCode: string, type: 'pedido' | 'venta') => {
    // La página ArchivedOrderDetails maneja tanto pedidos como ventas
    // Usamos el código (pedido_id/venta_id) como parámetro porque así está configurado
    navigate(`/orders/archived/${orderCode}/details`);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Pedidos Completados</h2>
          <p className="text-muted-foreground">Revisión de pedidos y ventas completados</p>
        </div>
        <Card className="p-6 bg-card border-border">
          <div className="text-center text-muted-foreground">Cargando...</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Pedidos Completados</h2>
        <p className="text-muted-foreground">Revisión de pedidos y ventas completados</p>
      </div>

      <Tabs defaultValue="picking" className="space-y-4">
        <TabsList>
          <TabsTrigger value="picking">
            Picking Libre ({completedPickingSessions.length})
          </TabsTrigger>
          <TabsTrigger value="orders">
            Pedidos ({completedOrders.length})
          </TabsTrigger>
          <TabsTrigger value="sales">
            Ventas ({completedSales.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orders">
          <Card className="p-6 bg-card border-border">
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full">
                <thead>
                  <tr className="bg-table-header">
                    <th className="px-4 py-4 text-left text-sm font-medium text-muted-foreground">Pedido</th>
                    <th className="px-4 py-4 text-left text-sm font-medium text-muted-foreground">Tipo</th>
                    <th className="px-4 py-4 text-left text-sm font-medium text-muted-foreground">Tienda</th>
                    <th className="px-4 py-4 text-left text-sm font-medium text-muted-foreground">Items</th>
                    <th className="px-4 py-4 text-left text-sm font-medium text-muted-foreground">Completado</th>
                    <th className="px-4 py-4 text-left text-sm font-medium text-muted-foreground">Estado Revisión</th>
                    <th className="px-4 py-4 text-right text-sm font-medium text-muted-foreground">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {completedOrders.map((order, index) => {
                    const signature = getSignatureForOrder(order.id, 'pedido');
                    return (
                      <tr 
                        key={order.id}
                        className={`${index % 2 === 0 ? 'bg-table-row' : 'bg-table-header'} hover:bg-table-hover transition-colors`}
                      >
                        <td className="px-4 py-4 text-sm text-foreground font-medium">
                          {order.pedido_id}
                        </td>
                        <td className="px-4 py-4 text-sm text-foreground">
                          <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                            {order.tipo}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 text-sm text-foreground">
                          {order.tienda_nombre || 'Sin tienda'}
                        </td>
                        <td className="px-4 py-4 text-sm text-foreground">
                          {order.total_items} items
                        </td>
                        <td className="px-4 py-4 text-sm text-foreground">
                          {formatTimeAgo(order.updated_at)}
                        </td>
                        <td className="px-4 py-4 text-sm text-foreground">
                          <OrderSignatureBadge
                            signature={signature}
                            canSign={canSign}
                            onSignClick={() => setSelectedOrder({
                              id: order.id,
                              code: order.pedido_id,
                              type: 'pedido'
                            })}
                            compact
                          />
                        </td>
                        <td className="px-4 py-4 text-right space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewOrder(order.id, order.pedido_id, 'pedido')}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Ver
                          </Button>
                          {canSign && !signature && (
                            <Button
                              size="sm"
                              onClick={() => setSelectedOrder({
                                id: order.id,
                                code: order.pedido_id,
                                type: 'pedido'
                              })}
                            >
                              Firmar
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {completedOrders.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No hay pedidos completados
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="sales">
          <Card className="p-6 bg-card border-border">
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full">
                <thead>
                  <tr className="bg-table-header">
                    <th className="px-4 py-4 text-left text-sm font-medium text-muted-foreground">Venta</th>
                    <th className="px-4 py-4 text-left text-sm font-medium text-muted-foreground">Cliente</th>
                    <th className="px-4 py-4 text-left text-sm font-medium text-muted-foreground">Items</th>
                    <th className="px-4 py-4 text-left text-sm font-medium text-muted-foreground">Completado</th>
                    <th className="px-4 py-4 text-left text-sm font-medium text-muted-foreground">Estado Revisión</th>
                    <th className="px-4 py-4 text-right text-sm font-medium text-muted-foreground">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {completedSales.map((sale, index) => {
                    const signature = getSignatureForOrder(sale.id, 'venta');
                    return (
                      <tr 
                        key={sale.id}
                        className={`${index % 2 === 0 ? 'bg-table-row' : 'bg-table-header'} hover:bg-table-hover transition-colors`}
                      >
                        <td className="px-4 py-4 text-sm text-foreground font-medium">
                          {sale.venta_id}
                        </td>
                        <td className="px-4 py-4 text-sm text-foreground">
                          {getClientName(sale.cliente_info)}
                        </td>
                        <td className="px-4 py-4 text-sm text-foreground">
                          {sale.total_items} items
                        </td>
                        <td className="px-4 py-4 text-sm text-foreground">
                          {formatTimeAgo(sale.updated_at)}
                        </td>
                        <td className="px-4 py-4 text-sm text-foreground">
                          <OrderSignatureBadge
                            signature={signature}
                            canSign={canSign}
                            onSignClick={() => setSelectedOrder({
                              id: sale.id,
                              code: sale.venta_id,
                              type: 'venta'
                            })}
                            compact
                          />
                        </td>
                        <td className="px-4 py-4 text-right space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewOrder(sale.id, sale.venta_id, 'venta')}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Ver
                          </Button>
                          {canSign && !signature && (
                            <Button
                              size="sm"
                              onClick={() => setSelectedOrder({
                                id: sale.id,
                                code: sale.venta_id,
                                type: 'venta'
                              })}
                            >
                              Firmar
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {completedSales.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No hay ventas completadas
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="picking">
          <Card className="p-6 bg-card border-border">
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full">
                <thead>
                  <tr className="bg-table-header">
                    <th className="px-4 py-4 text-left text-sm font-medium text-muted-foreground">Sesión</th>
                    <th className="px-4 py-4 text-left text-sm font-medium text-muted-foreground">Creado por</th>
                    <th className="px-4 py-4 text-left text-sm font-medium text-muted-foreground">Tienda Destino</th>
                    <th className="px-4 py-4 text-left text-sm font-medium text-muted-foreground">Items</th>
                    <th className="px-4 py-4 text-left text-sm font-medium text-muted-foreground">Documento</th>
                    <th className="px-4 py-4 text-left text-sm font-medium text-muted-foreground">Completado</th>
                    <th className="px-4 py-4 text-left text-sm font-medium text-muted-foreground">Estado Revisión</th>
                    <th className="px-4 py-4 text-right text-sm font-medium text-muted-foreground">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {completedPickingSessions.map((session, index) => {
                    const signature = getSignatureForOrder(session.id, 'picking_libre');
                    const sessionCode = `PL-${session.id.slice(0, 8).toUpperCase()}`;
                    return (
                      <tr 
                        key={session.id}
                        className={`${index % 2 === 0 ? 'bg-table-row' : 'bg-table-header'} hover:bg-table-hover transition-colors`}
                      >
                        <td className="px-4 py-4 text-sm text-foreground font-medium">
                          {sessionCode}
                        </td>
                        <td className="px-4 py-4 text-sm text-foreground">
                          {session.created_by_name}
                        </td>
                        <td className="px-4 py-4 text-sm text-foreground">
                          {session.tiendas?.nombre || 'Sin tienda'}
                        </td>
                        <td className="px-4 py-4 text-sm text-foreground">
                          {session.total_items} items
                        </td>
                        <td className="px-4 py-4 text-sm text-foreground">
                          <Badge variant="secondary" className="bg-purple-100 text-purple-800">
                            {session.documento_tipo === 'guia_remision' ? 'Guía Remisión' : 'Traslado Interno'}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 text-sm text-foreground">
                          {formatTimeAgo(session.completed_at)}
                        </td>
                        <td className="px-4 py-4 text-sm text-foreground">
                          <OrderSignatureBadge
                            signature={signature}
                            canSign={canSign}
                            onSignClick={() => setSelectedOrder({
                              id: session.id,
                              code: sessionCode,
                              type: 'picking_libre'
                            })}
                            compact
                          />
                        </td>
                        <td className="px-4 py-4 text-right space-x-2">
                          {canSign && !signature && (
                            <Button
                              size="sm"
                              onClick={() => setSelectedOrder({
                                id: session.id,
                                code: sessionCode,
                                type: 'picking_libre'
                              })}
                            >
                              Firmar
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {completedPickingSessions.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No hay sesiones de picking libre completadas
                </div>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {selectedOrder && (
        <OrderSignatureModal
          open={!!selectedOrder}
          onOpenChange={() => setSelectedOrder(null)}
          orderCode={selectedOrder.code}
          orderType={selectedOrder.type}
          onSign={handleSignOrder}
          signature={getSignatureForOrder(selectedOrder.id, selectedOrder.type)}
        />
      )}
    </div>
  );
}