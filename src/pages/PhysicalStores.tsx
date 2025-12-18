import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface Pedido {
  pedido_id: string;
  tipo: string;
  tienda: string;
  cantidad: number;
  fecha_creacion: string;
}

export default function PhysicalStores() {
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);

  const handleStartOrder = (orderId: string) => {
    navigate(`/orders/store/${orderId}`);
  };

  useEffect(() => {
    async function fetchPedidos() {
      try {
        console.log('Fetching from pedidos...');
        const { data, error } = await supabase
          .from('pedidos')
          .select('*')
          .eq('tipo', 'Tienda')
          .neq('estado', 'archivado'); // Filtrar solo pedidos tipo Tienda no archivados
        
        if (error) {
          console.error('Error fetching pedidos:', error);
          return;
        }
        
        // Agrupar por pedido_id y sintetizar los datos
        const groupedPedidos = data?.reduce((acc, item) => {
          if (!item.pedido_id) return acc;
          
          if (!acc[item.pedido_id]) {
            acc[item.pedido_id] = {
              pedido_id: item.pedido_id,
              tipo: item.tipo || 'Tienda', // Usar el campo tipo real
              tienda: item.tienda_nombre || '',
              cantidad: 0,
              fecha_creacion: item.created_at
            };
          }
          
          // Sumar cantidad
          acc[item.pedido_id].cantidad += item.total_items || 0;
          
          // Mantener la fecha más antigua
          if (item.created_at && new Date(item.created_at) < new Date(acc[item.pedido_id].fecha_creacion)) {
            acc[item.pedido_id].fecha_creacion = item.created_at;
          }
          
          return acc;
        }, {} as Record<string, Pedido>);
        
        setPedidos(Object.values(groupedPedidos || {}) as Pedido[]);
      } catch (error) {
        console.error('Error fetching pedidos:', error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchPedidos();
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
          <h2 className="text-xl font-semibold text-foreground mb-2">Tiendas físicas</h2>
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
        <h2 className="text-xl font-semibold text-foreground mb-2">Tiendas físicas</h2>
        <p className="text-muted-foreground">Pedidos pendientes de sacar</p>
      </div>

      <Card className="p-6 bg-card border-border">
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full">
            <thead>
              <tr className="bg-table-header">
                <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Tipo</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Pedido</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Tienda</th>
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
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                      }`}
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
                      Empezar →
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