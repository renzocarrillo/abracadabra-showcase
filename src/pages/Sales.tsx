import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { usePermissions } from '@/hooks/usePermissions';

interface Pedido {
  pedido_id: string;
  tipo: string;
  tienda: string;
  cantidad: number;
  fecha_creacion: string;
}

export default function Sales() {
  const navigate = useNavigate();
  const { userType } = usePermissions();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);

  // Redirect "cabeza_de_tienda" users if they access this route directly
  useEffect(() => {
    if (userType?.name === 'cabeza_de_tienda') {
      navigate('/dashboard', { replace: true });
      return;
    }
  }, [userType, navigate]);

  const handleStartOrder = (ventaId: string) => {
    navigate(`/orders/sale/${ventaId}`);
  };

  useEffect(() => {
    async function fetchVentas() {
      try {
        console.log('Fetching sales from ventas...');
        const { data, error } = await supabase
          .from('ventas')
          .select(`
            *,
            ventas_detalle(cantidad)
          `)
          .neq('estado', 'cancelada')
          .neq('estado', 'archivado')
          .order('created_at', { ascending: false });
        
        if (error) {
          console.error('Error fetching ventas:', error);
          return;
        }
        
        // Mapear las ventas al formato esperado
        const ventasFormateadas = data?.map((venta: any) => {
          const totalItems = venta.ventas_detalle?.reduce((sum: number, detalle: any) => sum + detalle.cantidad, 0) || 0;
          const clienteNombre = venta.cliente_info?.tipo === 'company' 
            ? venta.cliente_info?.razonSocial || venta.cliente_info?.company
            : `${venta.cliente_info?.firstName || ''} ${venta.cliente_info?.lastName || ''}`.trim() || venta.cliente_info?.nombre;

          return {
            pedido_id: venta.venta_id,
            tipo: 'Venta',
            tienda: clienteNombre || 'Cliente directo',
            cantidad: totalItems,
            fecha_creacion: venta.created_at
          };
        }) || [];
        
        setPedidos(ventasFormateadas);
      } catch (error) {
        console.error('Error fetching sales:', error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchVentas();
  }, []);

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
          <h2 className="text-xl font-semibold text-foreground mb-2">Ventas</h2>
          <p className="text-muted-foreground">Ventas pendientes de procesar</p>
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
        <h2 className="text-xl font-semibold text-foreground mb-2">Ventas</h2>
        <p className="text-muted-foreground">Ventas pendientes de procesar</p>
      </div>

      <Card className="p-6 bg-card border-border">
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full">
            <thead>
              <tr className="bg-table-header">
                <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Tipo</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Pedido</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Cliente</th>
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
                      className="px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                    >
                      {pedido.tipo}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-foreground font-medium">{pedido.pedido_id}</td>
                  <td className="px-6 py-4 text-sm text-foreground">{pedido.tienda}</td>
                  <td className="px-6 py-4 text-sm text-foreground">{pedido.cantidad} Items</td>
                  <td className="px-6 py-4 text-sm text-foreground">{formatTimeAgo(pedido.fecha_creacion)}</td>
                  <td className="px-6 py-4 text-right">
                    <Button 
                      className={`${getButtonColorByAge(pedido.fecha_creacion)} text-white px-6 py-2 rounded-full transition-all duration-200`}
                      style={getButtonStyle(pedido.fecha_creacion)}
                      onClick={() => handleStartOrder(pedido.pedido_id)}
                    >
                      Procesar →
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}