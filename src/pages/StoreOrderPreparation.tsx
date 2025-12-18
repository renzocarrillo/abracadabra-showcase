import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, User, MoreHorizontal, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useAuditLog } from '@/hooks/useAuditLog';
import { usePermissions } from '@/hooks/usePermissions';
import DeleteConfirmationDialog from '@/components/DeleteConfirmationDialog';

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
}

export default function StoreOrderPreparation() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { userType } = usePermissions();
  const { toast } = useToast();
  const { logPedidoStateChange } = useAuditLog();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [detalles, setDetalles] = useState<PedidoDetalle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleBack = () => {
    navigate('/orders');
  };

  const handleDeleteOrder = async () => {
    if (!pedido || !profile) return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase.rpc('delete_order_with_stock_release', {
        order_uuid: pedido.id,
        deleted_by_user_id: profile.id,
        deleted_by_user_name: profile.full_name || profile.email
      });

      if (error) {
        console.error('Error deleting order:', error);
        toast({
          title: "Error",
          description: "No se pudo eliminar el pedido",
          variant: "destructive"
        });
      } else {
        // Log audit trail for deletion
        await logPedidoStateChange(
          pedido.id,
          pedido.pedido,
          'cancelado',
          'pendiente',
          'archivado',
          {
            tipo_operacion: 'eliminacion_manual',
            motivo: 'Eliminado por usuario',
            eliminado_por: profile.full_name || profile.email
          }
        );

        toast({
          title: "Pedido eliminado",
          description: "El pedido ha sido eliminado y archivado correctamente",
        });
        navigate('/orders');
      }
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Ocurrió un error inesperado",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handlePrepareItem = async (detalleId: string) => {
    // Esta funcionalidad necesita ser reimplementada con la nueva estructura de base de datos
    console.log('Funcionalidad de preparación deshabilitada temporalmente');
    return;
  };

  const handleUndoItem = async (detalleId: string) => {
    // Esta funcionalidad necesita ser reimplementada con la nueva estructura de base de datos
    console.log('Funcionalidad de deshacer preparación deshabilitada temporalmente');
    return;
  };

  useEffect(() => {
    async function fetchPedidoAndDetails() {
      if (!orderId) return;
      
      // Decodificar el ID del pedido para manejar caracteres especiales como #
      const decodedOrderId = decodeURIComponent(orderId);
      
      try {
        // Cargar datos del pedido desde la nueva estructura de base de datos
        console.log('Cargando pedido:', decodedOrderId);
        
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
          preparacion: 'no preparado' // Por defecto, ya que no tenemos este campo aún
        })) || [];
        
        setDetalles(detalles);
        console.log('Pedido cargado exitosamente:', pedido);
        console.log('Detalles cargados:', detalles);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchPedidoAndDetails();
  }, [orderId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Cargando...</h2>
          <p className="text-muted-foreground">Cargando información del pedido...</p>
        </div>
        <Card className="p-6 bg-card border-border">
          <div className="text-center text-muted-foreground">Cargando...</div>
        </Card>
      </div>
    );
  }

  if (!pedido) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleBack}
            className="p-2"
          >
            <ChevronLeft size={20} />
          </Button>
          <h2 className="text-xl font-semibold text-foreground">Pedido no encontrado</h2>
        </div>
        <Card className="p-6 bg-card border-border">
          <div className="text-center text-muted-foreground">No se pudo encontrar el pedido solicitado.</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with back button and order info */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleBack}
            className="p-2"
          >
            <ChevronLeft size={20} />
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">{pedido.pedido}</h1>
        </div>
        
        <div className="flex items-center gap-4">
          {userType?.name !== 'cabeza_de_tienda' && (
            <>
              <Button 
                variant="default"
                onClick={() => navigate(`/orders/store/${encodeURIComponent(orderId)}/picking`)}
              >
                Empezar picking
              </Button>
              <Button 
                variant="outline"
                onClick={() => navigate(`/orders/store/${encodeURIComponent(orderId)}/edit`)}
              >
                Editar pedido
              </Button>
            </>
          )}
          {profile?.role === 'admin' && (
            <Button 
              variant="outline"
              onClick={() => setShowDeleteDialog(true)}
              className="text-destructive hover:text-destructive border-destructive/20 hover:border-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Eliminar pedido
            </Button>
          )}
          <div className="bg-muted rounded-lg px-4 py-2">
            <p className="text-sm text-muted-foreground">Tienda</p>
            <p className="font-medium text-foreground">{pedido.tienda}</p>
          </div>
        </div>
      </div>

      {/* Tabla resumen del pedido */}
      <Card className="p-6 bg-card border-border">
        <h3 className="text-lg font-semibold text-foreground mb-4">Resumen del pedido</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 text-sm font-medium text-muted-foreground">
                  Producto <ChevronLeft className="inline ml-1 rotate-[-90deg]" size={14} />
                </th>
                <th className="text-left py-3 text-sm font-medium text-muted-foreground">SKU</th>
                <th className="text-left py-3 text-sm font-medium text-muted-foreground">Solicitado</th>
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
                  <td className="py-4 text-foreground">{detalle.sku || '-'}</td>
                  <td className="py-4 text-foreground">{detalle.cantidad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleDeleteOrder}
        title="¿Eliminar pedido?"
        description={`¿Estás seguro de que deseas eliminar el pedido ${pedido?.pedido}?`}
        isDeleting={isDeleting}
      />

    </div>
  );
}