import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Pedido {
  pedido_id: string;
  tipo: string;
  tienda: string;
  cantidad: number;
  fecha_creacion: string;
  notas?: string;
}

export default function Shopify() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingImages, setSyncingImages] = useState(false);
  const [syncStats, setSyncStats] = useState<{
    total: number;
    synced: number;
    failed: number;
    skipped: number;
  } | null>(null);

  const handleStartOrder = (ventaId: string) => {
    navigate(`/orders/sale/${ventaId}`);
  };

  useEffect(() => {
    async function fetchVentasShopify() {
      try {
        console.log('Fetching Shopify sales from ventas...');
        const { data, error } = await supabase
          .from('ventas')
          .select(`
            *,
            ventas_detalle(cantidad)
          `)
          .neq('estado', 'cancelada')
          .neq('estado', 'archivado')
          .or('notas.ilike.%Shopify%,notas.ilike.%shopify%')
          .order('created_at', { ascending: false });
        
        if (error) {
          console.error('Error fetching Shopify ventas:', error);
          return;
        }
        
        // Mapear las ventas de Shopify al formato esperado
        const ventasFormateadas = data?.map((venta: any) => {
          const totalItems = venta.ventas_detalle?.reduce((sum: number, detalle: any) => sum + detalle.cantidad, 0) || 0;
          const clienteNombre = venta.cliente_info?.tipo === 'company' 
            ? venta.cliente_info?.razonSocial || venta.cliente_info?.company
            : `${venta.cliente_info?.firstName || ''} ${venta.cliente_info?.lastName || ''}`.trim() || venta.cliente_info?.nombre;

          return {
            pedido_id: venta.venta_id,
            tipo: 'Shopify',
            tienda: clienteNombre || 'Cliente Shopify',
            cantidad: totalItems,
            fecha_creacion: venta.created_at,
            notas: venta.notas
          };
        }) || [];
        
        setPedidos(ventasFormateadas);
      } catch (error) {
        console.error('Error fetching Shopify sales:', error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchVentasShopify();
  }, []);

  const handleSyncImages = async () => {
    setSyncingImages(true);
    setSyncStats(null);
    
    try {
      toast({
        title: "Sincronizando imágenes",
        description: "Esto puede tardar varios minutos..."
      });

      const { data, error } = await supabase.functions.invoke('sync-shopify-images', {
        body: { force_refresh: false }
      });

      if (error) {
        throw error;
      }

      setSyncStats(data.stats);
      
      toast({
        title: "Sincronización completada",
        description: `${data.stats.synced} productos actualizados, ${data.stats.skipped} omitidos, ${data.stats.failed} fallidos`
      });
    } catch (error) {
      console.error('Error syncing images:', error);
      toast({
        title: "Error en la sincronización",
        description: "No se pudieron sincronizar las imágenes",
        variant: "destructive"
      });
    } finally {
      setSyncingImages(false);
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
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Shopify</h2>
            <p className="text-muted-foreground">Pedidos de Shopify pendientes de procesar</p>
          </div>
        </div>
        <Card className="p-6 bg-card border-border">
          <div className="text-center text-muted-foreground">Cargando...</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Shopify</h2>
          <p className="text-muted-foreground">Pedidos de Shopify y gestión de imágenes</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => window.open('https://pelodeoso.myshopify.com/admin', '_blank')}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Abrir Shopify
          </Button>
        </div>
      </div>

      {/* Image Sync Section */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5" />
                Sincronización de Imágenes de Productos
              </CardTitle>
              <CardDescription>
                Sincroniza las imágenes de productos desde Shopify para visualizarlas en Abracadabra
              </CardDescription>
            </div>
            <Button
              onClick={handleSyncImages}
              disabled={syncingImages}
              size="default"
              className="ml-4"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${syncingImages ? 'animate-spin' : ''}`} />
              {syncingImages ? 'Sincronizando...' : 'Sincronizar Imágenes'}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {syncStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
              <div>
                <div className="text-2xl font-bold text-foreground">{syncStats.total}</div>
                <div className="text-xs text-muted-foreground">Total productos</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{syncStats.synced}</div>
                <div className="text-xs text-muted-foreground">Sincronizados</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600">{syncStats.skipped}</div>
                <div className="text-xs text-muted-foreground">Omitidos (caché)</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">{syncStats.failed}</div>
                <div className="text-xs text-muted-foreground">Fallidos</div>
              </div>
            </div>
          )}

          <div className="p-3 bg-muted/50 rounded-md">
            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-2">📋 Instrucciones</p>
              <ul className="space-y-1 text-xs">
                <li>• Primero sincroniza tus productos con Shopify</li>
                <li>• Luego carga las imágenes en tu panel de Shopify</li>
                <li>• Finalmente ejecuta esta sincronización para cachear las URLs</li>
                <li>• Las imágenes estarán disponibles por variante (color) en los detalles del producto</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

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
              {pedidos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                    No hay pedidos de Shopify por el momento
                  </td>
                </tr>
              ) : (
                pedidos.map((pedido, index) => (
                  <tr 
                    key={pedido.pedido_id}
                    className={`${index % 2 === 0 ? 'bg-table-row' : 'bg-table-header'} hover:bg-table-hover transition-colors`}
                  >
                    <td className="px-6 py-4 text-sm text-foreground">
                      <span 
                        className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}