import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, Truck, Download, RotateCcw, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { TransportistSelectionDialog } from '@/components/TransportistSelectionDialog';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { BinInstructions } from '@/components/BinInstructions';
import { ProductsList } from '@/components/ProductsList';
import { PickingProgress } from '@/components/PickingProgress';
import { usePickingSession } from '@/hooks/usePickingSession';
import { ProductIssueDialog } from '@/components/ProductIssueDialog';
import { PickingAdjustmentsSummary } from '@/components/PickingAdjustmentsSummary';
import { VerificationView } from '@/components/VerificationView';
import { findAlternativeBins, reassignDuringPicking, adjustOrderQuantity } from './Picking-handlers';
import { useAuth } from '@/hooks/useAuth';
import PinSignatureInput from '@/components/PinSignatureInput';
import PickerSelector from '@/components/PickerSelector';
import { audioService } from '@/lib/audioService';

interface Pedido {
  id: string;
  tipo: string;
  pedido: string;
  tienda: string;
  cantidad: number;
  fecha_creacion: string;
  estado?: string;
}

interface PedidoDetalle {
  id: string;
  pedido: string;
  nombre_producto: string;
  variante: string | null;
  sku: string | null;
  cantidad: number;
  preparacion: string | null;
  bin: string | null;
  prepared_at?: string;
}

interface BinPickingItem {
  id: string;
  originalDetalleId: string;
  pedido: string;
  nombre_producto: string;
  variante: string | null;
  sku: string | null;
  cantidad: number;
  bin: string;
  comprometido: number;
  preparacion: string | null;
  prepared_at?: string;
}

interface StockBin {
  sku: string;
  bin: string;
  disponibles: number;
  comprometido: number;
  en_existencia: number;
}

export default function Picking() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [signatureCompleted, setSignatureCompleted] = useState(false);
  const [signerInfo, setSignerInfo] = useState<{ name: string; timestamp: string; orderId: string } | null>(null);
  const [detalles, setDetalles] = useState<PedidoDetalle[]>([]);
  const [stockBins, setStockBins] = useState<StockBin[]>([]);
  const [binPickingItems, setBinPickingItems] = useState<BinPickingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferCompleted, setTransferCompleted] = useState(false);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [acceptsRemisionGuide, setAcceptsRemisionGuide] = useState<boolean>(false);
  const [showTransportistDialog, setShowTransportistDialog] = useState(false);
  const [remissionGuideLoading, setRemissionGuideLoading] = useState(false);
  const [useManualMode, setUseManualMode] = useState(false);
  const [flexibleMode, setFlexibleMode] = useState(false);
  const [showIssueDialog, setShowIssueDialog] = useState(false);
  const [currentIssue, setCurrentIssue] = useState<any>(null);
  const [selectedPicker, setSelectedPicker] = useState<{
    id: string;
    name: string;
  }>({
    id: profile?.id || '',
    name: profile?.full_name || ''
  });

  const {
    session,
    scanBin,
    scanProduct,
    moveToNextBin,
    resetSession,
    getCurrentBin,
    getProgress,
    getAllScannedItems,
    initializeSession,
    reportProductIssue,
    resolveIssue,
    startVerification,
    scanProductForVerification,
  } = usePickingSession(orderId || '', binPickingItems);

  const handleBack = () => {
    const decodedOrderId = decodeURIComponent(orderId || '');
    navigate(`/orders/store/${encodeURIComponent(decodedOrderId)}`);
  };

  const handlePrepareBinItem = async (binItemId: string) => {
    try {
      const now = new Date().toISOString();
      const binItem = binPickingItems.find(item => item.id === binItemId);
      if (!binItem) return;

      // Check if all bin items for this product are now prepared
      const allBinItemsForProduct = binPickingItems.filter(item => 
        item.originalDetalleId === binItem.originalDetalleId
      );
      const otherBinItems = allBinItemsForProduct.filter(item => item.id !== binItemId);
      const allOthersArePrepared = otherBinItems.every(item => item.preparacion === 'preparado');

      // Esta funcionalidad necesita ser reimplementada con la nueva estructura de base de datos
      // if (allOthersArePrepared) {
      //   const { error } = await (supabase as any)
      //     .from('pedidos2.0')
      //     .update({ preparacion: 'preparado' })
      //     .eq('id', binItem.originalDetalleId);
      //   
      //   if (error) {
      //     console.error('Error updating item:', error);
      //     return;
      //   }
      //   
      //   // Update local detalles state
      //   setDetalles(prev => prev.map(detalle => 
      //     detalle.id === binItem.originalDetalleId 
      //       ? { ...detalle, preparacion: 'preparado', prepared_at: now }
      //       : detalle
      //   ));
      // }
      
      // Update local bin picking items state
      setBinPickingItems(prev => prev.map(item => 
        item.id === binItemId 
          ? { ...item, preparacion: 'preparado', prepared_at: now }
          : item
      ));
    } catch (error) {
      console.error('Error preparing bin item:', error);
    }
  };

  const handleUndoBinItem = async (binItemId: string) => {
    try {
      const binItem = binPickingItems.find(item => item.id === binItemId);
      if (!binItem) return;

      // Esta funcionalidad necesita ser reimplementada con la nueva estructura de base de datos
      // const { error } = await (supabase as any)
      //   .from('pedidos2.0')
      //   .update({ preparacion: 'no preparado' })
      //   .eq('id', binItem.originalDetalleId);
      // 
      // if (error) {
      //   console.error('Error undoing item:', error);
      //   return;
      // }
      
      // Update local detalles state
      setDetalles(prev => prev.map(detalle => 
        detalle.id === binItem.originalDetalleId 
          ? { ...detalle, preparacion: 'no preparado', prepared_at: undefined }
          : detalle
      ));
      
      // Update local bin picking items state - mark all bin items for this product as not prepared
      setBinPickingItems(prev => prev.map(item => 
        item.originalDetalleId === binItem.originalDetalleId
          ? { ...item, preparacion: 'no preparado', prepared_at: undefined }
          : item
      ));
    } catch (error) {
      console.error('Error undoing bin item:', error);
    }
  };

  const handleCancelTransfer = async () => {
    if (signatureCompleted && signerInfo) {
      try {
        await supabase
          .from('order_signatures')
          .delete()
          .eq('order_id', signerInfo.orderId)
          .eq('order_type', 'pedido');
        
        setSignatureCompleted(false);
        setSignerInfo(null);
        
        toast({
          title: "Firma cancelada",
          description: "La firma ha sido eliminada"
        });
      } catch (error) {
        console.error('Error deleting signature:', error);
      }
    }
  };

  const handleEmitTransfer = async () => {
    if (!pedido || !session) return;
    
    // Warn if not signed (but allow to proceed)
    if (!signatureCompleted) {
      toast({
        title: "Advertencia",
        description: "No se ha firmado el pedido. Se recomienda firmar para trazabilidad.",
        variant: "default"
      });
    }

    setTransferLoading(true);
    
    try {
      // Get store information
      const { data: storeData, error: storeError } = await supabase
        .from('tiendas')
        .select('*')
        .eq('nombre', pedido.tienda)
        .single();

      if (storeError || !storeData) {
        toast({
          title: "Error",
          description: "No se pudo encontrar la información de la tienda",
          variant: "destructive"
        });
        return;
      }

      // Get scanned items for transfer
      const scannedItems = getAllScannedItems();
      
      if (scannedItems.length === 0) {
        toast({
          title: "Sin artículos escaneados",
          description: "No hay artículos escaneados para transferir",
          variant: "destructive"
        });
        return;
      }

      // Prepare selected items data
      const selectedItems = scannedItems.map(item => ({
        sku: item.sku,
        quantity: item.quantity,
        bin: item.binCode
      }));

      console.log('Emitting transfer for items:', selectedItems);

      // Choose the appropriate function based on whether store belongs to Innovation
      const functionName = storeData.pertenenceinnovacion 
        ? 'create-internal-transfer' 
        : 'create-external-transfer';

      // Call the appropriate edge function
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: {
          orderId: pedido.pedido,
          selectedItems: selectedItems,
          storeInfo: storeData,
          productosRetiradosPor: selectedPicker.name // Enviar el nombre del picker
        }
      });

      if (error) {
        console.error('Transfer error:', error);
        throw error;
      }

      if (data.success) {
        toast({
          title: "Traslado interno creado",
          description: "El traslado interno ha sido creado exitosamente. El pedido ha sido archivado.",
        });
        
        // Set transfer as completed and document URL if available
        setTransferCompleted(true);
        if (data.bsale_data?.guide?.urlPublicView) {
          setDocumentUrl(data.bsale_data.guide.urlPublicView);
        }
        
        // Navigate back to orders page since order is now archived
        setTimeout(() => navigate('/orders'), 2000);
      } else {
        throw new Error(data.error || 'Unknown error');
      }

    } catch (error) {
      console.error('Error emitting transfer:', error);
      toast({
        title: "Error",
        description: "Error al emitir el traslado interno: " + (error.message || 'Error desconocido'),
        variant: "destructive"
      });
    } finally {
      setTransferLoading(false);
    }
  };

  const handleRemissionGuideSubmit = async (transportistId: string) => {
    if (!pedido || !session) return;
    
    // Warn if not signed (but allow to proceed)
    if (!signatureCompleted) {
      toast({
        title: "Advertencia",
        description: "No se ha firmado el pedido. Se recomienda firmar para trazabilidad.",
        variant: "default"
      });
    }

    setRemissionGuideLoading(true);
    
    try {
      // Get scanned items for remission guide
      const scannedItems = getAllScannedItems();
      
      if (scannedItems.length === 0) {
        toast({
          title: "Sin artículos escaneados",
          description: "No hay artículos escaneados para la guía de remisión",
          variant: "destructive"
        });
        return;
      }

      // Prepare selected items data
      const selectedItems = scannedItems.map(item => ({
        sku: item.sku,
        quantity: item.quantity
      }));

      console.log('Creating remission guide for items:', selectedItems);

      // Call the remission guide edge function
      const { data, error } = await supabase.functions.invoke('create-remission-guide', {
        body: {
          orderId: pedido.pedido,
          selectedItems: selectedItems,
          transportistId: transportistId
        }
      });

      if (error) {
        console.error('Remission guide error:', error);
        throw error;
      }

      if (data.success) {
        toast({
          title: "Guía de remisión creada",
          description: "La guía de remisión ha sido creada exitosamente.",
        });
        
        // Close the dialog
        setShowTransportistDialog(false);
        
        // Set transfer as completed and document URL if available
        setTransferCompleted(true);
        if (data.bsaleResponse?.urlPublicView) {
          setDocumentUrl(data.bsaleResponse.urlPublicView);
        }
        
        // Navigate back to orders page since order is now processed
        setTimeout(() => navigate('/orders'), 2000);
      } else {
        throw new Error(data.error || 'Unknown error');
      }

    } catch (error) {
      console.error('Error creating remission guide:', error);
      toast({
        title: "Error",
        description: "Error al crear la guía de remisión: " + (error.message || 'Error desconocido'),
        variant: "destructive"
      });
    } finally {
      setRemissionGuideLoading(false);
    }
  };

  useEffect(() => {
    async function fetchPedidoAndDetails() {
      if (!orderId) return;
      
      const decodedOrderId = decodeURIComponent(orderId);
      
      try {
        // Fetch stock bins
        const { data: stockBinData, error: stockBinError } = await supabase
          .from('stockxbin')
          .select('sku, bin, disponibles, comprometido, en_existencia');
        
        if (stockBinError) {
          console.error('Error fetching stock bins:', stockBinError);
        } else {
          setStockBins(stockBinData || []);
        }

        console.log('Picking - Loading order:', decodedOrderId);
        
        // Fetch order data from new structure
        const { data: pedidoData, error: pedidoError } = await supabase
          .from('pedidos')
          .select('*')
          .eq('pedido_id', decodedOrderId)
          .single();
        
        if (pedidoError) {
          console.error('Error fetching pedido:', pedidoError);
          setPedido(null);
          setDetalles([]);
          setBinPickingItems([]);
          setLoading(false);
          return;
        }
        
        if (!pedidoData) {
          console.log('No pedido found for:', decodedOrderId);
          setPedido(null);
          setDetalles([]);
          setBinPickingItems([]);
          setLoading(false);
          return;
        }
        
        // Map pedido data
const pedido: Pedido = {
  id: pedidoData.id,
  tipo: 'Tienda', // Default type
  pedido: pedidoData.pedido_id,
  tienda: pedidoData.tienda_nombre || 'Sin tienda',
  cantidad: pedidoData.total_items || 0,
  fecha_creacion: pedidoData.created_at,
  estado: pedidoData.estado
};
        
setPedido(pedido);

// If order is already archived, reflect it in UI and try to load the document link
setTransferCompleted(pedidoData.estado === 'archivado');

// Prefer URL stored on the pedido; if missing, look up latest transfer record
if (pedidoData.url_public_view) {
  setDocumentUrl(pedidoData.url_public_view);
} else {
  const { data: lastTransfer, error: lastTransferError } = await supabase
    .from('traslados_internos')
    .select('url_public_view')
    .eq('pedido_id', pedidoData.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!lastTransferError && lastTransfer?.url_public_view) {
    setDocumentUrl(lastTransfer.url_public_view as string);
  }
}

// Fetch store information to check if it accepts remision guides
if (pedidoData.tienda_nombre) {
  const { data: storeData, error: storeError } = await supabase
    .from('tiendas')
    .select('accept_remision_guide')
    .eq('nombre', pedidoData.tienda_nombre)
    .single();
  
  if (!storeError && storeData) {
    setAcceptsRemisionGuide((storeData as any).accept_remision_guide || false);
  }
}

        // Fetch order details
        const { data: detallesData, error: detallesError } = await supabase
          .from('pedidos_detalle')
          .select('*')
          .eq('pedido_id', pedidoData.id);
        
        if (detallesError) {
          console.error('Error fetching detalles:', detallesError);
          setDetalles([]);
          setBinPickingItems([]);
          setLoading(false);
          return;
        }

        // Map detalles data
        const detalles: PedidoDetalle[] = detallesData?.map((item: any) => ({
          id: item.id,
          pedido: pedidoData.pedido_id,
          nombre_producto: item.nombre_producto || '',
          variante: item.variante,
          sku: item.sku,
          cantidad: item.cantidad_solicitada || 0,
          preparacion: 'no preparado', // Default status
          bin: null
        })) || [];
        
        setDetalles(detalles);
        
        // Create bin picking items using assignments
        const { data: asignacionesData, error: asignacionesError } = await supabase
          .from('pedidos_asignaciones')
          .select('*')
          .eq('pedido_id', pedidoData.id);

        if (asignacionesError) {
          console.error('Error fetching asignaciones:', asignacionesError);
        }

        // Create bin picking items from assignments
        const binItems: BinPickingItem[] = [];
        
        if (asignacionesData && asignacionesData.length > 0) {
          asignacionesData.forEach((assignment: any) => {
            const detalle = detalles.find(d => d.id === assignment.pedido_detalle_id);
            if (detalle) {
              binItems.push({
                id: `${assignment.id}`,
                originalDetalleId: assignment.pedido_detalle_id,
                pedido: pedidoData.pedido_id,
                nombre_producto: detalle.nombre_producto,
                variante: detalle.variante,
                sku: assignment.sku,
                cantidad: assignment.cantidad_asignada,
                bin: assignment.bin,
                comprometido: assignment.cantidad_asignada,
                preparacion: 'no preparado',
              });
            }
          });
        } else {
          // If no assignments, create items from detalles
          detalles.forEach(detalle => {
            binItems.push({
              id: `${detalle.id}_no_assignment`,
              originalDetalleId: detalle.id,
              pedido: detalle.pedido,
              nombre_producto: detalle.nombre_producto,
              variante: detalle.variante,
              sku: detalle.sku,
              cantidad: detalle.cantidad,
              bin: 'Sin asignar',
              comprometido: 0,
              preparacion: 'no preparado',
            });
          });
        }
        
        setBinPickingItems(binItems);
        
        console.log('Picking - Pedido loaded:', pedido);
        console.log('Picking - Detalles loaded:', detalles);
        console.log('Picking - Bin items created:', binItems);
        
      } catch (error) {
        console.error('Error fetching data:', error);
        setPedido(null);
        setDetalles([]);
        setBinPickingItems([]);
      } finally {
        setLoading(false);
      }
    }
    
    fetchPedidoAndDetails();
  }, [orderId]);

  const playSuccessBeep = () => {
    audioService.playSuccessBeep();
  };

  const handleScan = (code: string) => {
    if (!session) return;

    // Si estamos en modo verificación, escanear para verificar
    if (session.status === 'VERIFICATION_MODE') {
      const result = scanProductForVerification(code);
      if (result) {
        playSuccessBeep();
      }
      return;
    }

    if (session.status === 'WAITING_FOR_BIN') {
      const result = scanBin(code);
      if (result) {
        playSuccessBeep();
      }
    } else if (session.status === 'WAITING_FOR_PRODUCTS') {
      const result = scanProduct(code);
      if (result) {
        playSuccessBeep();
      }
    }
  };

  const handleToggleManualMode = () => {
    setFlexibleMode(!flexibleMode);
    toast({
      title: flexibleMode ? "Modo Normal Activado" : "Modo Flexible Activado",
      description: flexibleMode 
        ? "Picking en modo estándar" 
        : "Ahora puedes reportar productos faltantes o insuficientes",
    });
  };

  const handleReportProductIssue = (item: any) => {
    const currentBinData = getCurrentBin();
    if (!currentBinData) return;
    
    setCurrentIssue({
      sku: item.sku,
      productName: item.nombre_producto,
      binCode: currentBinData.binCode,
      expectedQuantity: item.cantidad,
      detalleId: item.id,
    });
    setShowIssueDialog(true);
  };

  const handleFindAlternatives = async (sku: string, quantity: number, excludeBin: string) => {
    try {
      return await findAlternativeBins(sku, quantity, excludeBin);
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudieron buscar bins alternativos",
        variant: "destructive"
      });
      return [];
    }
  };

  const handleConfirmReassignment = async (
    foundQuantity: number,
    selectedBins: Array<{ bin: string; quantity: number }>
  ) => {
    if (!currentIssue || !user || !pedido) return;

    try {
      await reassignDuringPicking(
        pedido.id,
        currentIssue.detalleId,
        currentIssue.sku,
        currentIssue.binCode,
        foundQuantity,
        selectedBins,
        user.id,
        user.email || 'Usuario'
      );

      resolveIssue(currentIssue.sku, currentIssue.binCode, selectedBins);

      // Reload data
      const response = await fetchPedidoAndDetails();

      toast({
        title: "Reasignación exitosa",
        description: `Producto ${currentIssue.productName} reasignado correctamente`,
      });

      setShowIssueDialog(false);
      setCurrentIssue(null);
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo realizar la reasignación",
        variant: "destructive"
      });
    }
  };

  const handleAdjustQuantity = async (newQuantity: number, reason: string) => {
    if (!currentIssue) return;

    try {
      await adjustOrderQuantity(currentIssue.detalleId, newQuantity, reason);

      resolveIssue(currentIssue.sku, currentIssue.binCode, []);

      // Reload data
      await fetchPedidoAndDetails();

      toast({
        title: "Pedido ajustado",
        description: `Cantidad ajustada a ${newQuantity} unidades`,
      });

      setShowIssueDialog(false);
      setCurrentIssue(null);
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo ajustar la cantidad del pedido",
        variant: "destructive"
      });
    }
  };

  // Función auxiliar para recargar datos
  const fetchPedidoAndDetails = async () => {
    // Esta función será la misma que el useEffect, extraída para reutilizar
    // Por ahora, la llamaremos desde el useEffect
  };

  const handleResetSession = () => {
    resetSession();
    toast({
      title: "Sesión reiniciada",
      description: "La sesión de picking ha sido reiniciada",
    });
  };

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
          <Button variant="ghost" size="sm" onClick={handleBack} className="p-2">
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

  const currentBin = getCurrentBin();
  const progress = getProgress();
  const canEmitDocuments = session?.status === 'VERIFICATION_COMPLETED';

  const formatDate = (dateString?: string) => {
    if (!dateString) return new Date().toLocaleDateString('es-ES', { 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
    
    return new Date(dateString).toLocaleDateString('es-ES', { 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
  };

  return (
    <div className="flex gap-6">
      {/* Main content */}
      <div className="flex-1 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={handleBack} className="p-2">
              <ChevronLeft size={20} />
            </Button>
            <h1 className="text-2xl font-semibold text-foreground">
              {decodeURIComponent(orderId || '')} › Picking
            </h1>
          </div>
          
          {session && !transferCompleted && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleManualMode}
              >
                <Settings className="w-4 h-4 mr-2" />
                {flexibleMode ? 'Modo Normal' : 'Modo Flexible'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetSession}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reiniciar
              </Button>
            </div>
          )}
        </div>

        {/* Scanning Interface */}
        {session && !useManualMode && !transferCompleted ? (
          <div className="space-y-6">
            {/* Scanner Input */}
            <Card className="p-4 bg-card border-border">
              <BarcodeScanner
                onScan={handleScan}
                disabled={session.status === 'VERIFICATION_COMPLETED'}
                expectedCode={
                  session.status === 'WAITING_FOR_BIN' && currentBin ? 
                    currentBin.binCode : 
                    undefined
                }
                placeholder={
                  session.status === 'WAITING_FOR_BIN' ? 
                    "Escanee el código del bin..." : 
                    session.status === 'VERIFICATION_MODE' ?
                    "Escanee producto para verificar..." :
                    "Escanee el código del producto..."
                }
              />
            </Card>

            {/* Current Step Instructions */}
            {session.status === 'WAITING_FOR_BIN' && currentBin && (
              <BinInstructions
                binCode={currentBin.binCode}
                currentIndex={session.currentBinIndex}
                totalBins={session.binsToProcess.length}
                itemCount={currentBin.items.length}
              />
            )}

            {session.status === 'WAITING_FOR_PRODUCTS' && currentBin && (
              <>
                <ProductsList
                  binCode={currentBin.binCode}
                  items={currentBin.items}
                  onNextBin={moveToNextBin}
                  canProceedToNext={currentBin.items.every(item => item.isScanned)}
                  onReportIssue={handleReportProductIssue}
                  flexibleMode={flexibleMode}
                />
                {session && session.issues && session.issues.length > 0 && (
                  <PickingAdjustmentsSummary issues={session.issues} />
                )}
              </>
            )}

            {session.status === 'BIN_COMPLETED' && currentBin && (
              <Card className="p-6 bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800">
                <div className="text-center space-y-4">
                  <div className="text-green-600 dark:text-green-400">
                    <div className="text-lg font-semibold">Bin {currentBin.binCode} Completado</div>
                    <div className="text-sm">Todos los productos han sido escaneados correctamente</div>
                  </div>
                  <Button 
                    onClick={moveToNextBin}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    Continuar al Siguiente Bin
                  </Button>
                </div>
              </Card>
            )}

            {session.status === 'PICKING_COMPLETED_AWAITING_VERIFICATION' && (
              <Card className="p-6 bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800">
                <div className="text-center space-y-4">
                  <div className="text-blue-600 dark:text-blue-400">
                    <div className="text-xl font-bold">¡Picking Completado!</div>
                    <div className="text-sm">Ahora debe verificar todos los productos escaneados</div>
                  </div>
                  <Button 
                    onClick={startVerification}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Iniciar Verificación
                  </Button>
                </div>
              </Card>
            )}

              {session.status === 'VERIFICATION_MODE' && (
                <VerificationView
                  verificationItems={session.verificationItems}
                  onScan={handleScan}
                />
              )}

            {session.status === 'VERIFICATION_COMPLETED' && (
              <>
                <Card className="p-6 bg-success/10 border-success/20">
                  <div className="text-center space-y-4">
                    <div className="text-success">
                      <div className="text-xl font-bold">¡Verificación Completada!</div>
                      <div className="text-sm">Todos los productos han sido verificados. Ya puede emitir los documentos.</div>
                    </div>
                  </div>
                </Card>

                {/* Picker Selector Section */}
                <PickerSelector
                  selectedPickerId={selectedPicker.id}
                  selectedPickerName={selectedPicker.name}
                  onPickerChange={(id, name) => setSelectedPicker({ id, name })}
                  currentUserId={profile?.id || ''}
                  currentUserName={profile?.full_name || ''}
                  currentUserType={profile?.user_types?.name || null}
                />

                {/* PIN Signature Section */}
                {signatureCompleted ? (
                  <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                    <div className="p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="h-5 w-5 text-green-600">✓</div>
                        <h3 className="text-lg font-semibold text-green-700 dark:text-green-400">
                          Pedido firmado correctamente
                        </h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        <strong>Firmado por:</strong> {signerInfo?.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        <strong>Fecha:</strong> {signerInfo?.timestamp && new Date(signerInfo.timestamp).toLocaleString('es-PE')}
                      </p>
                    </div>
                  </Card>
                ) : (
                  <Card className="bg-card border-border">
                    <div className="p-6">
                      <h3 className="text-lg font-semibold mb-2">Firma Digital (Opcional)</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        ⚠️ La firma es <strong>opcional</strong> pero recomendada para trazabilidad
                      </p>
                      <PinSignatureInput
                        orderId={pedido.id}
                        orderCode={pedido.pedido}
                        orderType="pedido"
                        orderDestination={pedido.tienda}
                        onSignSuccess={async (signerName, signedAt) => {
                          setSignatureCompleted(true);
                          setSignerInfo({ name: signerName, timestamp: signedAt, orderId: pedido.id });
                        }}
                        showNotesField={true}
                      />
                    </div>
                  </Card>
                )}
              </>
            )}
          </div>
        ) : useManualMode ? (
          /* Manual Mode - Legacy Interface */
          <div className="space-y-4">
            {Object.entries(binPickingItems.reduce((acc, item) => {
              const key = `${item.bin}_${item.preparacion}`;
              if (!acc[key]) acc[key] = [];
              acc[key].push(item);
              return acc;
            }, {} as { [key: string]: BinPickingItem[] })).map(([key, binItems]) => {
              const bin = binItems[0].bin;
              const isPrepared = binItems[0].preparacion === 'preparado';
              
              return (
                <Card key={key} className="p-4 bg-card border-border">
                  <div className="flex items-center gap-3 mb-4">
                    <Badge className={isPrepared ? "bg-gray-100 text-gray-800 border-0 px-3 py-1" : "bg-yellow-100 text-yellow-800 border-0 px-3 py-1"}>
                      {isPrepared ? 'Preparado' : 'No preparado'}
                    </Badge>
                    <Badge variant="secondary" className="px-3 py-1">
                      {bin}
                    </Badge>
                  </div>
                  
                  <div className="space-y-3">
                    {binItems.map(binItem => (
                      <div key={binItem.id} className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                        <div className="flex-1">
                          <h3 className="font-semibold text-foreground">
                            {binItem.nombre_producto}
                          </h3>
                          <div className="text-sm text-muted-foreground">
                            {binItem.variante} {binItem.sku}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1">
                            <span className="text-sm text-muted-foreground">×</span>
                            <span className="font-semibold text-foreground">{binItem.cantidad}</span>
                          </div>
                          
                          <Button 
                            onClick={() => isPrepared ? handleUndoBinItem(binItem.id) : handlePrepareBinItem(binItem.id)}
                            variant={isPrepared ? "outline" : "default"}
                            size="sm"
                            className={isPrepared ? "bg-red-500 hover:bg-red-600 text-white border-red-500 hover:border-red-600" : ""}
                          >
                            {isPrepared ? 'Deshacer' : 'Preparar'}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="p-6 bg-card border-border">
            <div className="text-center text-muted-foreground">
              {transferCompleted ? 'El picking ha sido completado' : 'No hay sesión activa de picking'}
            </div>
          </Card>
        )}
      </div>

      {/* Sidebar */}
      <div className="w-80 space-y-4">
        {/* Progress Card */}
        {session && (
          <PickingProgress
            bins={session.binsToProcess}
            currentBinIndex={session.currentBinIndex}
            completedBins={progress.completed}
            totalBins={progress.total}
            percentage={progress.percentage}
          />
        )}

        <Card className="p-4 bg-card border-border">
          <div className="text-sm text-muted-foreground mb-2">Información de la tienda</div>
          <div className="space-y-1">
            <div className="font-semibold text-foreground">{pedido.tienda}</div>
            <div className="text-sm text-muted-foreground">
              Pedido: {pedido.pedido}
            </div>
            <div className="text-sm text-muted-foreground">
              Total artículos: {pedido.cantidad}
            </div>
            <div className="text-sm text-muted-foreground">
              Fecha: {formatDate(pedido.fecha_creacion)}
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-card border-border">
          <div className="text-sm text-muted-foreground mb-3">Acciones</div>
          <div className="space-y-2">
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={handleEmitTransfer}
              disabled={transferCompleted || transferLoading || !canEmitDocuments}
            >
              {transferLoading ? (
                <>Procesando...</>
              ) : (
                <>
                  <Truck className="w-4 h-4 mr-2" />
                  Emitir Traslado Interno
                </>
              )}
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start"
              disabled={
                transferCompleted ||
                !acceptsRemisionGuide || 
                !canEmitDocuments
              }
              onClick={() => setShowTransportistDialog(true)}
            >
              Emitir guía de remisión
            </Button>
          </div>
        </Card>

        {/* Document Downloads - Always visible */}
        <Card className="p-4 bg-card border-border">
          <div className="text-sm text-muted-foreground mb-3">Documentos Relacionados</div>
          <div className="space-y-2">
            <Button 
              variant="outline" 
              className="w-full justify-start"
              disabled={!documentUrl}
              onClick={() => documentUrl && window.open(documentUrl, '_blank')}
            >
              <Download className="w-4 h-4 mr-2" />
              {documentUrl ? 'Descargar Guía de Remisión' : 'Documento no disponible'}
            </Button>
            {!documentUrl && (
              <div className="text-xs text-muted-foreground text-center py-1">
                El documento estará disponible después de emitir el traslado interno
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Transportist Selection Dialog */}
      <TransportistSelectionDialog
        open={showTransportistDialog}
        onOpenChange={(open) => {
          if (!open) {
            handleCancelTransfer();
          }
          setShowTransportistDialog(open);
        }}
        onTransportistSelected={(transportistId) => {
          // The dialog will handle the transportist selection
          // and the actual submission will be done through onSendToSunat
        }}
        onSendToSunat={handleRemissionGuideSubmit}
        loading={remissionGuideLoading}
      />

      {/* Product Issue Dialog */}
      <ProductIssueDialog
        open={showIssueDialog}
        onOpenChange={setShowIssueDialog}
        issue={currentIssue}
        onFindAlternatives={handleFindAlternatives}
        onConfirmReassignment={handleConfirmReassignment}
        onAdjustQuantity={handleAdjustQuantity}
      />
    </div>
  );
}