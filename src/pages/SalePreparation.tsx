import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ChevronLeft, User, Trash2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import DeleteConfirmationDialog from '@/components/DeleteConfirmationDialog';

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
  guia_remision?: boolean;
}

interface VentaDetalle {
  id: string;
  sku: string;
  nombre_producto: string;
  variante: string | null;
  cantidad: number;
  precio_unitario: number;
}

export default function SalePreparation() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();
  const { hasPermission, isAdmin } = usePermissions();
  const [venta, setVenta] = useState<Venta | null>(null);
  const [detalles, setDetalles] = useState<VentaDetalle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRetryingGuide, setIsRetryingGuide] = useState(false);

  const handleBack = () => {
    navigate(-1);
  };

  const handleRetryGuideEmission = async () => {
    if (!venta) return;
    
    setIsRetryingGuide(true);
    try {
      toast({
        title: "Reintentando emisión de guía",
        description: "Por favor espera mientras se reintenta la emisión...",
      });

      // Navigate to the client document preparation page
      navigate(`/orders/sale/${encodeURIComponent(orderId!)}/client-preparation`);
      
    } catch (error) {
      console.error('Error navigating to guide emission:', error);
      toast({
        title: "Error",
        description: "No se pudo acceder a la página de emisión de guía",
        variant: "destructive"
      });
    } finally {
      setIsRetryingGuide(false);
    }
  };

  const handleDeleteSale = async () => {
    if (!venta || !profile) return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase.rpc('delete_sale_with_stock_release', {
        sale_uuid: venta.id,
        deleted_by_user_id: profile.id,
        deleted_by_user_name: profile.full_name || profile.email
      });

      if (error) {
        console.error('Error deleting sale:', error);
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        toast({
          title: "Error al eliminar venta",
          description: error.message || "No se pudo eliminar la venta. Verifica la consola para más detalles.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Venta eliminada",
          description: "La venta ha sido eliminada y archivada correctamente",
        });
        navigate('/orders');
      }
    } catch (error: any) {
      console.error('Error:', error);
      console.error('Exception details:', {
        message: error?.message,
        stack: error?.stack
      });
      toast({
        title: "Error inesperado",
        description: error?.message || "Ocurrió un error inesperado. Verifica la consola para más detalles.",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  useEffect(() => {
    async function fetchVenta() {
      if (!orderId) return;
      
      const decodedOrderId = decodeURIComponent(orderId);
      
      try {
        console.log('Fetching venta:', decodedOrderId);
        
        // Obtener datos de la venta
        const { data: ventaData, error: ventaError } = await supabase
          .from('ventas')
          .select('*')
          .eq('venta_id', decodedOrderId)
          .maybeSingle();
        
        if (ventaError) {
          console.error('Error fetching venta:', ventaError);
          setLoading(false);
          return;
        }
        
        if (!ventaData) {
          console.log('No venta found with ID:', decodedOrderId);
          setVenta(null);
          setLoading(false);
          return;
        }
        
        setVenta(ventaData);
        
        // Obtener detalles de la venta
        const { data: detallesData, error: detallesError } = await supabase
          .from('ventas_detalle')
          .select('*')
          .eq('venta_id', ventaData.id);
        
        if (detallesError) {
          console.error('Error fetching venta detalles:', detallesError);
        } else {
          setDetalles(detallesData || []);
        }
        
      } catch (error) {
        console.error('Error fetching venta:', error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchVenta();
  }, [orderId]);

  if (loading) {
    return (
      <div className="container mx-auto px-6 py-8">
        <div className="text-center text-muted-foreground">Cargando venta...</div>
      </div>
    );
  }

  if (!venta) {
    return (
      <div className="container mx-auto px-6 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleBack}
            className="flex items-center gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Volver
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Venta no encontrada</h1>
        </div>
        <div className="text-center text-muted-foreground">
          No se pudo encontrar la venta con ID: {orderId}
        </div>
      </div>
    );
  }

  const clienteInfo = venta.cliente_info || {};
  const clienteNombre = clienteInfo.nombre || 
    (clienteInfo.firstName && clienteInfo.lastName ? `${clienteInfo.firstName} ${clienteInfo.lastName}` : '') ||
    clienteInfo.razonSocial || 'Cliente sin nombre';
  
  // Check if document has been emitted
  const documentEmitted = !!(venta.url_public_view || venta.id_bsale_documento);
  
  // Check if sale is stuck waiting for guide emission
  const isWaitingForGuide = venta.estado === 'documento_emitido' && 
    venta.documento_tipo === 'factura' && 
    !venta.guia_remision;

  return (
    <div className="container mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleBack}
            className="flex items-center gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Volver
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Preparación de Venta</h1>
        </div>
        
        <div className="flex items-center gap-2">
          {isWaitingForGuide && (
            <Button 
              variant="default"
              onClick={handleRetryGuideEmission}
              disabled={isRetryingGuide}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRetryingGuide ? 'animate-spin' : ''}`} />
              Reintentar emisión de guía
            </Button>
          )}
          <Button 
            variant="default"
            onClick={() => navigate(`/orders/sale/${encodeURIComponent(orderId!)}/picking`)}
            disabled={documentEmitted}
          >
            Empezar picking
          </Button>
          <Button 
            variant="outline"
            onClick={() => navigate(`/orders/sale/${encodeURIComponent(orderId!)}/edit`)}
            disabled={documentEmitted}
            className={documentEmitted ? "opacity-50 cursor-not-allowed" : ""}
            title={documentEmitted ? "No se puede editar una venta con documento emitido" : "Editar venta"}
          >
            Editar venta
          </Button>
          {(hasPermission('delete_sales') || isAdmin()) && (
            <Button 
              variant="outline"
              onClick={() => setShowDeleteDialog(true)}
              disabled={documentEmitted}
              className={`text-destructive hover:text-destructive border-destructive/20 hover:border-destructive ${documentEmitted ? "opacity-50 cursor-not-allowed" : ""}`}
              title={documentEmitted ? "No se puede eliminar una venta con documento emitido" : "Eliminar venta"}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Eliminar venta
            </Button>
          )}
        </div>
      </div>

      {/* Order Info */}
      <div className="bg-card rounded-lg border border-border p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <label className="text-sm font-medium text-muted-foreground">ID Venta</label>
            <p className="text-lg font-semibold text-foreground">{venta.venta_id}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Estado</label>
            <p className="text-lg font-semibold text-foreground capitalize">{venta.estado}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Cliente</label>
            <p className="text-lg font-semibold text-foreground">{clienteNombre}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Total</label>
            <p className="text-lg font-semibold text-foreground">S/ {venta.total}</p>
          </div>
        </div>
      </div>

      {/* Customer & Shipping Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Customer Info */}
        <div className="bg-card rounded-lg border border-border p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <User className="h-5 w-5" />
            Información del Cliente
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Nombre</label>
              <p className="text-foreground">{clienteNombre}</p>
            </div>
            {clienteInfo.email && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Email</label>
                <p className="text-foreground">{clienteInfo.email}</p>
              </div>
            )}
            {clienteInfo.telefono && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Teléfono</label>
                <p className="text-foreground">{clienteInfo.telefono}</p>
              </div>
            )}
            {clienteInfo.ruc && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">RUC</label>
                <p className="text-foreground">{clienteInfo.ruc}</p>
              </div>
            )}
          </div>
        </div>

        {/* Shipping Info */}
        {venta.envio_info && (
          <div className="bg-card rounded-lg border border-border p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Información de Envío</h3>
            <div className="space-y-3">
              {venta.envio_info.direccion && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Dirección</label>
                  <p className="text-foreground">{venta.envio_info.direccion}</p>
                </div>
              )}
              {venta.envio_info.ciudad && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Ciudad</label>
                  <p className="text-foreground">{venta.envio_info.ciudad}</p>
                </div>
              )}
              {venta.envio_info.provincia && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Provincia</label>
                  <p className="text-foreground">{venta.envio_info.provincia}</p>
                </div>
              )}
              {venta.envio_info.ubigeoTexto && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Ubigeo</label>
                  <p className="text-foreground">{venta.envio_info.ubigeoTexto}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Order Items */}
      <div className="bg-card rounded-lg border border-border p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Productos de la Venta</h3>
        {detalles.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 text-sm font-medium text-muted-foreground">SKU</th>
                    <th className="text-left py-3 text-sm font-medium text-muted-foreground">Producto</th>
                    <th className="text-left py-3 text-sm font-medium text-muted-foreground">Variante</th>
                    <th className="text-right py-3 text-sm font-medium text-muted-foreground">Cantidad</th>
                    <th className="text-right py-3 text-sm font-medium text-muted-foreground">Precio Unit.</th>
                    <th className="text-right py-3 text-sm font-medium text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {detalles.map((detalle) => (
                    <tr key={detalle.id} className="border-b border-border last:border-b-0">
                      <td className="py-3 text-sm text-foreground font-mono">{detalle.sku}</td>
                      <td className="py-3 text-sm text-foreground">{detalle.nombre_producto}</td>
                      <td className="py-3 text-sm text-muted-foreground">{detalle.variante || '-'}</td>
                      <td className="py-3 text-sm text-foreground text-right">{detalle.cantidad}</td>
                      <td className="py-3 text-sm text-foreground text-right">S/ {detalle.precio_unitario}</td>
                      <td className="py-3 text-sm text-foreground text-right font-medium">
                        S/ {(detalle.cantidad * detalle.precio_unitario).toFixed(2)}
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
                    <span className="text-foreground">S/ {venta?.subtotal?.toFixed(2) || "0.00"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IGV (18%):</span>
                    <span className="text-foreground">S/ {venta?.igv?.toFixed(2) || "0.00"}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-lg">
                    <span className="text-foreground">Total:</span>
                    <span className="text-foreground">S/ {venta?.total?.toFixed(2) || "0.00"}</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center text-muted-foreground py-8">
            No se encontraron productos para esta venta
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleDeleteSale}
        title="¿Eliminar venta?"
        description={`¿Estás seguro de que deseas eliminar la venta ${venta?.venta_id}?`}
        isDeleting={isDeleting}
      />
    </div>
  );
}
