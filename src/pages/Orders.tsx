import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface PedidoUnificado {
  pedido_id: string;
  tipo: string;
  tienda: string;
  cantidad: number;
  fecha_creacion: string;
  es_venta?: boolean;
}

export default function Orders() {
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState<PedidoUnificado[]>([]);
  const [loading, setLoading] = useState(true);

  const handleStartOrder = (pedidoId: string, tipo: string) => {
    const encodedOrderId = encodeURIComponent(pedidoId);
    if (tipo === 'Tienda' || tipo === 'traslado') {
      navigate(`/orders/store/${encodedOrderId}`);
    } else if (tipo === 'Web') {
      navigate(`/orders/web/${encodedOrderId}`);
    } else if (tipo === 'Venta') {
      navigate(`/orders/sale/${encodedOrderId}`);
    }
  };

const fetchPedidosYVentas = useCallback(async () => {
  try {
    console.log('Fetching pedidos y ventas...');
    setLoading(true);

    // Fetch pedidos
    const { data: pedidosData, error: pedidosError } = await supabase
      .from('pedidos')
      .select('*')
      .neq('estado', 'archivado');

    // Fetch ventas con detalles para obtener cantidad
    const { data: ventasData, error: ventasError } = await supabase
      .from('ventas')
      .select(`
        *,
        ventas_detalle(cantidad)
      `)
      .neq('estado', 'cancelada')
      .neq('estado', 'archivado');

    if (pedidosError) console.error('Error fetching pedidos:', pedidosError);
    if (ventasError) console.error('Error fetching ventas:', ventasError);

    // Mapear pedidos
    const mappedPedidos = (pedidosData || []).map(item => ({
      pedido_id: item.pedido_id,
      tipo: item.tipo || 'Tienda',
      tienda: item.tienda_nombre || 'Sin tienda',
      cantidad: item.total_items || 0,
      fecha_creacion: item.created_at,
      es_venta: false
    }));

    // Mapear ventas
    const mappedVentas = (ventasData || []).map(item => {
      const clienteInfo = typeof item.cliente_info === 'object' && item.cliente_info && !Array.isArray(item.cliente_info) ? item.cliente_info as any : {};
      let clienteNombre = 'Cliente sin nombre';
      if (clienteInfo.nombre && clienteInfo.nombre.trim()) clienteNombre = clienteInfo.nombre;
      else if (clienteInfo.firstName || clienteInfo.lastName) {
        const firstName = clienteInfo.firstName || '';
        const lastName = clienteInfo.lastName || '';
        clienteNombre = `${firstName} ${lastName}`.trim();
      } else if (clienteInfo.razonSocial && clienteInfo.razonSocial.trim()) {
        clienteNombre = clienteInfo.razonSocial;
      }
      const totalItems = Array.isArray(item.ventas_detalle) 
        ? item.ventas_detalle.reduce((sum, d) => sum + (d.cantidad || 0), 0)
        : 0;
      return {
        pedido_id: item.venta_id,
        tipo: 'Venta',
        tienda: clienteNombre,
        cantidad: totalItems,
        fecha_creacion: item.created_at,
        es_venta: true
      };
    });

    const todosCombinados = [...mappedPedidos, ...mappedVentas]
      .sort((a, b) => new Date(b.fecha_creacion).getTime() - new Date(a.fecha_creacion).getTime());

    setPedidos(todosCombinados);
  } catch (error) {
    console.error('Error fetching data:', error);
  } finally {
    setLoading(false);
  }
}, []);

useEffect(() => {
  fetchPedidosYVentas();
}, [fetchPedidosYVentas]);

// Suscribirse a cambios en pedidos y ventas para actualizar en tiempo real
useEffect(() => {
  const channel = supabase
    .channel('orders-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => {
      fetchPedidosYVentas();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ventas' }, () => {
      fetchPedidosYVentas();
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [fetchPedidosYVentas]);

  const formatTimeAgo = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return formatDistanceToNow(date, { addSuffix: true, locale: es });
    } catch (error) {
      return 'hace un momento';
    }
  };

  const getButtonColorByAge = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const hoursDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
      
      // Si es 12 horas o más, rojo oscuro
      if (hoursDiff >= 12) {
        return 'bg-red-800 hover:bg-red-900';
      }
      
      return `hover:brightness-90 transition-all duration-200`;
    } catch (error) {
      return 'bg-gray-600 hover:bg-gray-700';
    }
  };

  const getButtonStyle = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const hoursDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
      
      // Si es 12 horas o más, rojo oscuro
      if (hoursDiff >= 12) {
        return { backgroundColor: 'hsl(0, 70%, 35%)' };
      }
      
      // Calcular el porcentaje de 0 a 12 horas
      const percentage = Math.min(hoursDiff / 12, 1);
      
      // Interpolación de colores en escala HSL
      const hue = Math.round(120 - (120 * percentage)); // De 120 (verde) a 0 (rojo)
      const saturation = 70;
      const lightness = Math.round(55 - (15 * percentage)); // De 55% a 40%
      
      return { backgroundColor: `hsl(${hue}, ${saturation}%, ${lightness}%)` };
    } catch (error) {
      return { backgroundColor: 'hsl(0, 0%, 50%)' };
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Pedidos</h2>
          <p className="text-muted-foreground">Pedidos pendientes de sacar</p>
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
        <h2 className="text-xl font-semibold text-foreground mb-2">Pedidos</h2>
        <p className="text-muted-foreground">Pedidos pendientes de sacar</p>
      </div>

      <Card className="p-3 sm:p-6 bg-card border-border">
        {/* Desktop Table View */}
        <div className="hidden lg:block overflow-hidden rounded-lg border border-border">
          <table className="w-full">
            <thead>
              <tr className="bg-table-header">
                <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Tipo</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Pedido</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Tienda/Cliente</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Cantidad</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Generado hace</th>
                <th className="px-6 py-4 text-right text-sm font-medium text-muted-foreground">Acción</th>
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
                          : pedido.tipo === 'Venta'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                          : pedido.tipo === 'traslado'
                          ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                      }`}
                    >
                      {pedido.tipo}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-foreground font-medium">{pedido.pedido_id}</td>
                  <td className="px-6 py-4 text-sm text-foreground">
                    {pedido.es_venta ? pedido.tienda : pedido.tienda}
                  </td>
                  <td className="px-6 py-4 text-sm text-foreground">
                    {pedido.cantidad > 0 ? `${pedido.cantidad} Items` : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-foreground">{formatTimeAgo(pedido.fecha_creacion)}</td>
                  <td className="px-6 py-4 text-right">
                    <Button 
                      className={`${getButtonColorByAge(pedido.fecha_creacion)} text-white px-6 py-2 rounded-full transition-all duration-200`}
                      style={getButtonStyle(pedido.fecha_creacion)}
                      onClick={() => handleStartOrder(pedido.pedido_id, pedido.tipo)}
                    >
                      Empezar →
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="lg:hidden space-y-3">
          {pedidos.map((pedido, index) => (
            <Card key={pedido.pedido_id} className="p-4 bg-card border-border">
              <div className="flex flex-col space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span 
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        pedido.tipo === 'Web' 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                          : pedido.tipo === 'Venta'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                          : pedido.tipo === 'traslado'
                          ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                      }`}
                    >
                      {pedido.tipo}
                    </span>
                    <span className="text-sm font-medium text-foreground">{pedido.pedido_id}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatTimeAgo(pedido.fecha_creacion)}
                  </span>
                </div>
                
                <div className="space-y-1">
                  <div className="text-sm text-foreground">
                    <span className="text-muted-foreground">Cliente: </span>
                    {pedido.es_venta ? pedido.tienda : pedido.tienda}
                  </div>
                  <div className="text-sm text-foreground">
                    <span className="text-muted-foreground">Cantidad: </span>
                    {pedido.cantidad > 0 ? `${pedido.cantidad} Items` : '-'}
                  </div>
                </div>
                
                <Button 
                  className={`${getButtonColorByAge(pedido.fecha_creacion)} text-white w-full rounded-full transition-all duration-200`}
                  style={getButtonStyle(pedido.fecha_creacion)}
                  onClick={() => handleStartOrder(pedido.pedido_id, pedido.tipo)}
                >
                  Empezar →
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </Card>
    </div>
  );
}