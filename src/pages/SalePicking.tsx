import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronLeft, Package, FileText, Truck, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { TransportistSelectionDialog } from "@/components/TransportistSelectionDialog";
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { BinInstructions } from '@/components/BinInstructions';
import { ProductsList } from '@/components/ProductsList';
import { PickingProgress } from '@/components/PickingProgress';
import { usePickingSession } from '@/hooks/usePickingSession';
import { VerificationView } from '@/components/VerificationView';
import { useAuth } from '@/hooks/useAuth';
import PinSignatureInput from '@/components/PinSignatureInput';
import { ClientDocumentPreparation } from '@/components/ClientDocumentPreparation';

interface Venta {
  id: string;
  venta_id: string;
  estado: string;
  cliente_info: any;
  envio_info: any;
  facturacion_info?: any;
  total: number;
  created_at: string;
  documento_tipo?: string;
  guia_remision?: boolean;
  requiere_guia_remision?: boolean;
  url_public_view?: string;
  serial_number?: string;
  details_href?: string;
  id_bsale_documento?: number;
}

interface VentaDetalle {
  id: string;
  sku: string;
  nombre_producto: string;
  variante: string | null;
  cantidad: number;
  precio_unitario: number;
}

interface BinPickingItem {
  id: string;
  originalDetalleId: string;
  venta_id: string;
  nombre_producto: string;
  variante: string | null;
  sku: string;
  cantidad: number;
  bin: string;
  comprometido: number;
  preparacion: string | null;
  prepared_at?: string;
}

export default function SalePicking() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuth();
  const [venta, setVenta] = useState<Venta | null>(null);
  const [detalles, setDetalles] = useState<VentaDetalle[]>([]);
  const [binPickingItems, setBinPickingItems] = useState<BinPickingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [pickingCompleted, setPickingCompleted] = useState(false);
  const [showGuideDialog, setShowGuideDialog] = useState(false);
  const [guideLoading, setGuideLoading] = useState(false);
  const [showTransportistDialog, setShowTransportistDialog] = useState(false);
  const [documentDetails, setDocumentDetails] = useState<any>(null);
  const [selectedTransportista, setSelectedTransportista] = useState<{ name: string; ruc: string } | null>(null);
  const [remissionGuideLoading, setRemissionGuideLoading] = useState(false);
  const [useManualMode, setUseManualMode] = useState(true); // Empieza en modo manual para compatibilidad
  const [signatureCompleted, setSignatureCompleted] = useState(false);
  const [signerInfo, setSignerInfo] = useState<{ name: string; timestamp: string; orderId: string } | null>(null);
  
  const {
    session,
    scanBin,
    scanProduct,
    moveToNextBin,
    resetSession,
    getCurrentBin,
    getProgress,
    startVerification,
    scanProductForVerification,
  } = usePickingSession(orderId || '', binPickingItems);

  // Auto-detect if picking is completed
  useEffect(() => {
    if (binPickingItems.length > 0 && !loading) {
      const allPrepared = binPickingItems.every(item => item.preparacion === 'preparado');
      setPickingCompleted(allPrepared);
    }
  }, [binPickingItems, loading]);

  // Auto-detect when session is completed in automatic mode
  useEffect(() => {
    if (!useManualMode && session && session.status === 'VERIFICATION_COMPLETED') {
      setPickingCompleted(true);
    }
  }, [session, useManualMode]);

  const handleBack = () => {
    const decodedOrderId = decodeURIComponent(orderId || '');
    navigate(`/orders/sale/${encodeURIComponent(decodedOrderId)}`);
  };

  const handleScan = (code: string) => {
    if (!session) return;

    if (session.status === 'VERIFICATION_MODE') {
      scanProductForVerification(code);
      return;
    }

    if (session.status === 'WAITING_FOR_BIN') {
      scanBin(code);
    } else if (session.status === 'WAITING_FOR_PRODUCTS') {
      scanProduct(code);
    }
  };

  const handleResetSession = () => {
    if (confirm('¿Está seguro de reiniciar el proceso de picking? Se perderán todos los escaneos.')) {
      resetSession();
    }
  };

  const handlePrepareBinItem = async (binItemId: string) => {
    try {
      const now = new Date().toISOString();
      const binItem = binPickingItems.find(item => item.id === binItemId);
      if (!binItem) return;

      // Update local bin picking items state
      setBinPickingItems(prev => prev.map(item => 
        item.id === binItemId 
          ? { ...item, preparacion: 'preparado', prepared_at: now }
          : item
      ));

      // Check if all items are now prepared
      const updatedItems = binPickingItems.map(item => 
        item.id === binItemId 
          ? { ...item, preparacion: 'preparado', prepared_at: now }
          : item
      );
      
      const allPrepared = updatedItems.every(item => item.preparacion === 'preparado');
      if (allPrepared) {
        setPickingCompleted(true);
      }
    } catch (error) {
      console.error('Error preparing bin item:', error);
    }
  };

  const handleUndoBinItem = async (binItemId: string) => {
    try {
      const binItem = binPickingItems.find(item => item.id === binItemId);
      if (!binItem) return;

      // Update local bin picking items state
      setBinPickingItems(prev => prev.map(item => 
        item.originalDetalleId === binItem.originalDetalleId
          ? { ...item, preparacion: 'no preparado', prepared_at: undefined }
          : item
      ));

      setPickingCompleted(false);
    } catch (error) {
      console.error('Error undoing bin item:', error);
    }
  };

  const handleCancelDocumentDialog = async () => {
    // No longer needed - kept for backward compatibility
  };

  const handleEmitDocumentWithClientInfo = async (
    updatedClienteInfo: any,
    documentType: string,
    generateGuideFlag: boolean,
    transportistId?: string
  ) => {
    if (!venta) return;
    
    // Warn if not signed (but allow to proceed)
    if (!signatureCompleted) {
      toast({
        title: "Advertencia",
        description: "No se ha firmado la venta. Se recomienda firmar para trazabilidad.",
        variant: "default"
      });
    }

    const clienteInfo = updatedClienteInfo;
    const clientType = typeof clienteInfo.tipo === 'boolean' 
      ? (clienteInfo.tipo ? 'empresa' : 'persona_natural')
      : clienteInfo.tipo === '1' ? 'empresa' : 'persona_natural';
    
    const selectedDocumentType = documentType;
    const generateGuide = generateGuideFlag;

    // First update cliente_info in the database
    const { error: updateError } = await supabase
      .from('ventas')
      .update({ cliente_info: clienteInfo })
      .eq('id', venta.id);

    if (updateError) {
      toast({
        title: "Error",
        description: "No se pudo actualizar la información del cliente",
        variant: "destructive"
      });
      console.error('Error updating cliente_info:', updateError);
      return;
    }

    setDocumentLoading(true);
    
    try {
      toast({
        title: "Procesando documento",
        description: `Emitiendo ${selectedDocumentType.toLowerCase()}${generateGuide ? ' con guía de remisión' : ''}...`,
      });

      // Determine which edge function to call based on document type and guide generation
      let functionName = '';
      
      if (selectedDocumentType === 'Ticket') {
        // Tickets no pueden tener guía de remisión (entrega inmediata)
        if (clientType === 'persona_natural') {
          functionName = 'emit-ticket-natural';
        } else {
          functionName = 'emit-ticket-empresa';
        }
      } else if (selectedDocumentType === 'Factura') {
        functionName = generateGuide ? 'emit-factura-with-guide' : 'emit-factura';
      } else { // Boleta
        functionName = generateGuide ? 'emit-boleta-with-guide' : 'emit-boleta';
      }
      
      // Call the appropriate edge function with transportistId if provided
      const { data: result, error } = await supabase.functions.invoke(functionName, {
        body: {
          saleId: venta.id,
          documentType: selectedDocumentType,
          generateGuide: generateGuide,
          transportistId: transportistId // Pass transportistId to edge function
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!result.success) {
        const errorMessage = result.error;
        const isDateError = errorMessage.includes('invalid emission date') || errorMessage.includes('doc_005');
        
        throw new Error(isDateError 
          ? `Error de fecha: ${errorMessage}. Verifique que la fecha de emisión sea válida.`
          : errorMessage
        );
      }

      toast({
        title: "Documento emitido exitosamente",
        description: (
          <div className="space-y-2">
            <div>{selectedDocumentType} generado correctamente.</div>
            {result.urlGuidesPdf && (
              <div>Guía de remisión generada.</div>
            )}
            <div className="mt-2">
              <a 
                href={result.urlPublicView} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline"
              >
                Ver documento
              </a>
            </div>
          </div>
        ),
      });
      
      // Refresh venta data to update document info
      fetchVentaAndDetails();
      
      // Navigate back to orders page
      setTimeout(() => navigate('/orders'), 3000);

    } catch (error) {
      console.error('Error emitting document:', error);
      toast({
        title: "Error",
        description: "Error al emitir el documento: " + (error.message || 'Error desconocido'),
        variant: "destructive"
      });
    } finally {
      setDocumentLoading(false);
    }
  };

  const handleEmitGuide = async () => {
    if (!venta) return;

    setGuideLoading(true);
    
    try {
      // Primero actualizar los detail_id_bsale
      toast({
        title: "Preparando guía de remisión",
        description: "Obteniendo información de detalles del documento...",
      });

      const { data: updateResult, error: updateError } = await supabase.functions.invoke('update-detail-ids', {
        body: { 
          saleId: venta.id,
          documentId: venta.id_bsale_documento 
        }
      });
      
      if (updateError) {
        throw new Error(`Error al obtener detail IDs: ${updateError.message}`);
      }

      // Get ventas_detalle with detail_id_bsale (which are now updated)
      const { data: ventaDetails, error: detailsError } = await supabase
        .from('ventas_detalle')
        .select('detail_id_bsale, cantidad')
        .eq('venta_id', venta.id);

      if (detailsError) {
        throw new Error(detailsError.message);
      }

      if (!ventaDetails || ventaDetails.length === 0) {
        throw new Error('No se encontraron detalles de la venta');
      }

      // Check if all details have detail_id_bsale
      const missingDetailIds = ventaDetails.filter(detail => !detail.detail_id_bsale);
      if (missingDetailIds.length > 0) {
        throw new Error('Algunos productos no tienen ID de detalle de Bsale. Es posible que el documento no se haya emitido correctamente.');
      }

      // Construct the details structure expected by create-remission-guide
      const details = ventaDetails.map(detail => ({
        detailId: detail.detail_id_bsale,
        quantity: detail.cantidad
      }));

      setDocumentDetails({ details });
      setShowGuideDialog(false);
      setShowTransportistDialog(true);

    } catch (error) {
      console.error('Error preparing remission guide:', error);
      toast({
        title: "Error",
        description: "Error al preparar la guía de remisión: " + (error.message || 'Error desconocido'),
        variant: "destructive"
      });
    } finally {
      setGuideLoading(false);
    }
  };

  const handleSendToSunat = async () => {
    if (!venta || !documentDetails || !selectedTransportista) return;

    setRemissionGuideLoading(true);
    
    try {
      toast({
        title: "Enviando a Sunat",
        description: "Creando guía de remisión...",
      });

      const clienteInfo = venta.cliente_info || {};
      const envioInfo = venta.envio_info || {};

      // Calculate emission date (today at 00:00:00 UTC)
      const today = new Date();
      const emissionDateEpoch = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 1000);
      const startDateYmd = today.toISOString().split('T')[0]; // YYYY-MM-DD

      // Normalize client fields expected by the Edge Function
      const clientCompany = (clienteInfo.razonSocial || `${(clienteInfo.firstName || clienteInfo.nombre || '').toString().trim()} ${(clienteInfo.lastName || clienteInfo.apellido || '').toString().trim()}`.trim() || 'Cliente').toString();
      const clientActivity = (clienteInfo.actividad || 'Venta de accesorios de vestir').toString();
      const clientAddress = (envioInfo.direccion || clienteInfo.direccion || 'Prol. Lucanas 1043').toString();
      const clientDistrict = (envioInfo.distrito || clienteInfo.distrito || 'Lima').toString();
      const clientCity = (envioInfo.provincia || clienteInfo.provincia || 'Lima').toString();
      const clientRecipient = (
        clienteInfo.recipient ||
        `${(clienteInfo.firstName || clienteInfo.nombre || '').toString().trim()} ${(clienteInfo.lastName || clienteInfo.apellido || '').toString().trim()}`.trim() ||
        'Destinatario'
      );

      const payload = {
        client: {
          code: (clienteInfo.ruc || clienteInfo.dni || '').toString(),
          email: (clienteInfo.email || '').toString(),
          company: clientCompany,
          activity: clientActivity,
          address: clientAddress,
          district: clientDistrict,
          city: clientCity,
        },
        shipping: {
          district: clientDistrict,
          city: clientCity,
          address: clientAddress,
          recipient: clientRecipient,
        },
        details: documentDetails.details,
        carrier: {
          nombre_empresa: (selectedTransportista?.name || (selectedTransportista as any)?.nombre_empresa || '').toString(),
          ruc: (selectedTransportista?.ruc || '').toString(),
        },
        destinoUbigeo: (envioInfo.ubigeoDestino || '150115').toString(), // Default to Lima if not specified
        emissionDateEpoch,
        startDateYmd,
        ventaId: venta.id,
      };

      const { data: result, error } = await supabase.functions.invoke('create-invoice-remission-guide', {
        body: payload
      });

      if (error) {
        throw new Error(error.message);
      }

      toast({
        title: "Guía de remisión creada",
        description: "La guía de remisión se ha creado exitosamente en Bsale.",
      });

      await fetchVentaAndDetails();
      setShowTransportistDialog(false);
      
      // Navigate back to orders page
      setTimeout(() => navigate('/orders'), 3000);

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


  const fetchVentaAndDetails = async () => {
    if (!orderId) return;
    
    const decodedOrderId = decodeURIComponent(orderId);
    
    try {
      console.log('SalePicking - Loading venta:', decodedOrderId);
      
      // Fetch venta data
      const { data: ventaData, error: ventaError } = await supabase
        .from('ventas')
        .select('*')
        .eq('venta_id', decodedOrderId)
        .single();
      
      if (ventaError) {
        console.error('Error fetching venta:', ventaError);
        setVenta(null);
        setDetalles([]);
        setBinPickingItems([]);
        setLoading(false);
        return;
      }
      
      if (!ventaData) {
        console.log('No venta found for:', decodedOrderId);
        setVenta(null);
        setDetalles([]);
        setBinPickingItems([]);
        setLoading(false);
        return;
      }
      
      setVenta(ventaData);

      // Fetch venta details
      const { data: detallesData, error: detallesError } = await supabase
        .from('ventas_detalle')
        .select('*')
        .eq('venta_id', ventaData.id);
      
      if (detallesError) {
        console.error('Error fetching venta detalles:', detallesError);
        setDetalles([]);
        setBinPickingItems([]);
        setLoading(false);
        return;
      }

      setDetalles(detallesData || []);
      
      // Create bin picking items using assignments
      const { data: asignacionesData, error: asignacionesError } = await supabase
        .from('ventas_asignaciones')
        .select('*')
        .eq('venta_id', ventaData.id);

      if (asignacionesError) {
        console.error('Error fetching asignaciones:', asignacionesError);
      }

      // Create bin picking items from assignments
      const binItems: BinPickingItem[] = [];
      
      if (asignacionesData && asignacionesData.length > 0) {
        asignacionesData.forEach((assignment: any) => {
          const detalle = detallesData?.find((d: any) => d.id === assignment.venta_detalle_id);
          if (detalle) {
            binItems.push({
              id: `${assignment.id}`,
              originalDetalleId: assignment.venta_detalle_id,
              venta_id: ventaData.venta_id,
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
        detallesData?.forEach((detalle: any) => {
          binItems.push({
            id: `${detalle.id}_no_assignment`,
            originalDetalleId: detalle.id,
            venta_id: ventaData.venta_id,
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
      
      console.log('SalePicking - Venta loaded:', ventaData);
      console.log('SalePicking - Detalles loaded:', detallesData);
      console.log('SalePicking - Bin items created:', binItems);
      
    } catch (error) {
      console.error('Error fetching data:', error);
      setVenta(null);
      setDetalles([]);
      setBinPickingItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {    
    fetchVentaAndDetails();
  }, [orderId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Cargando...</h2>
          <p className="text-muted-foreground">Cargando información de la venta...</p>
        </div>
        <Card className="p-6 bg-card border-border">
          <div className="text-center text-muted-foreground">Cargando...</div>
        </Card>
      </div>
    );
  }

  if (!venta) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={handleBack} className="p-2">
            <ChevronLeft size={20} />
          </Button>
          <h2 className="text-xl font-semibold text-foreground">Venta no encontrada</h2>
        </div>
        <Card className="p-6 bg-card border-border">
          <div className="text-center text-muted-foreground">No se pudo encontrar la venta solicitada.</div>
        </Card>
      </div>
    );
  }

  // Group items by bin and preparation status
  const groupItemsByBin = (items: BinPickingItem[]) => {
    const grouped: { [key: string]: BinPickingItem[] } = {};
    
    items.forEach(item => {
      const key = `${item.bin}_${item.preparacion}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(item);
    });
    
    return grouped;
  };

  const noPreparados = binPickingItems.filter(item => item.preparacion !== 'preparado');
  const preparados = binPickingItems.filter(item => item.preparacion === 'preparado');
  
  const noPreparadosGrouped = groupItemsByBin(noPreparados);
  const preparadosGrouped = groupItemsByBin(preparados);

  const clienteInfo = venta.cliente_info || {};
  const clienteNombre = clienteInfo.nombre || 
    (clienteInfo.firstName && clienteInfo.lastName ? `${clienteInfo.firstName} ${clienteInfo.lastName}` : '') ||
    clienteInfo.razonSocial || 'Cliente sin nombre';

  // Helper functions removed - now handled in ClientDocumentPreparation component

  // Si la venta está archivada (factura sin guía), mostrar estado completado
  if (venta.estado === 'archivado') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ChevronLeft className="h-4 w-4" />
            Volver
          </Button>
          <h1 className="text-2xl font-bold">Preparación de Venta {venta.venta_id}</h1>
        </div>

        <Card className="p-6">
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <FileText className="h-16 w-16 text-green-500" />
            </div>
            <h2 className="text-xl font-semibold text-green-700">¡Venta Completada!</h2>
            <p className="text-muted-foreground">
              Esta venta ya ha sido procesada completamente. Se emitió {venta.documento_tipo} sin guía de remisión.
            </p>
            {venta.url_public_view && (
              <div className="pt-4">
                <a 
                  href={venta.url_public_view} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 underline"
                >
                  <FileText className="h-4 w-4" />
                  Ver documento emitido
                </a>
              </div>
            )}
          </div>
        </Card>
      </div>
    );
  }

  const currentBin = getCurrentBin();
  const progress = getProgress();
  const canEmitDocuments = session?.status === 'VERIFICATION_COMPLETED';

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

          {session && !pickingCompleted && !useManualMode && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetSession}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reiniciar
            </Button>
          )}
        </div>

        {/* Scanning Interface */}
        {session && !useManualMode && !pickingCompleted ? (
          <div className="space-y-6">
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

            {session.status === 'WAITING_FOR_BIN' && currentBin && (
              <BinInstructions
                binCode={currentBin.binCode}
                currentIndex={session.currentBinIndex}
                totalBins={session.binsToProcess.length}
                itemCount={currentBin.items.length}
              />
            )}

            {session.status === 'WAITING_FOR_PRODUCTS' && currentBin && (
              <ProductsList
                binCode={currentBin.binCode}
                items={currentBin.items}
                onNextBin={moveToNextBin}
                canProceedToNext={currentBin.items.every(item => item.isScanned)}
              />
            )}

            {session.status === 'BIN_COMPLETED' && currentBin && (
              <Card className="p-6 bg-success/10 border-success/20">
                <div className="text-center space-y-4">
                  <div className="text-success">
                    <div className="text-lg font-semibold">Bin {currentBin.binCode} Completado</div>
                    <div className="text-sm">Todos los productos han sido escaneados correctamente</div>
                  </div>
                  <Button 
                    onClick={moveToNextBin}
                    className="bg-success hover:bg-success/90"
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

                {/* PIN Signature Section */}
                {signatureCompleted ? (
                  <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                    <div className="p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="h-5 w-5 text-green-600">✓</div>
                        <h3 className="text-lg font-semibold text-green-700 dark:text-green-400">
                          Venta firmada correctamente
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
                        orderId={venta.id}
                        orderCode={venta.venta_id}
                        orderType="venta"
                        orderDestination={(() => {
                          const clienteInfo = venta.cliente_info || {};
                          return clienteInfo?.nombre || 
                            (clienteInfo?.firstName && clienteInfo?.lastName ? `${clienteInfo.firstName} ${clienteInfo.lastName}` : '') ||
                            clienteInfo?.razonSocial || 'Cliente';
                        })()}
                        onSignSuccess={async (signerName, signedAt) => {
                          setSignatureCompleted(true);
                          setSignerInfo({ name: signerName, timestamp: signedAt, orderId: venta.id });
                        }}
                        showNotesField={true}
                      />
                    </div>
                  </Card>
                )}
              </>
            )}

            <PickingProgress
              bins={session.binsToProcess}
              currentBinIndex={session.currentBinIndex}
              completedBins={progress.completed}
              totalBins={progress.total}
              percentage={progress.percentage}
            />
          </div>
        ) : useManualMode ? (
          <div className="space-y-4">
          {/* Non-prepared bins */}
          {Object.entries(noPreparadosGrouped).map(([key, binItems]) => {
            const bin = binItems[0].bin;
            return (
              <Card key={key} className="p-4 bg-card border-border">
                <div className="flex items-center gap-3 mb-4">
                  <Badge className="bg-yellow-100 text-yellow-800 border-0 px-3 py-1">
                    No preparado
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
                        {binItem.variante && (
                          <span className="text-sm text-muted-foreground">
                            {binItem.variante}
                          </span>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-sm text-muted-foreground">SKU: {binItem.sku}</span>
                          <span className="text-sm font-medium text-foreground">
                            Cantidad: {binItem.cantidad}
                          </span>
                        </div>
                      </div>
                      <Button 
                        onClick={() => handlePrepareBinItem(binItem.id)}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <Package className="w-4 h-4 mr-2" />
                        Preparar
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}

          {/* Prepared bins */}
          {Object.entries(preparadosGrouped).map(([key, binItems]) => {
            const bin = binItems[0].bin;
            return (
              <Card key={key} className="p-4 bg-card border-border">
                <div className="flex items-center gap-3 mb-4">
                  <Badge className="bg-green-100 text-green-800 border-0 px-3 py-1">
                    Preparado
                  </Badge>
                  <Badge variant="secondary" className="px-3 py-1">
                    {bin}
                  </Badge>
                </div>
                
                <div className="space-y-3">
                  {binItems.map(binItem => (
                    <div key={binItem.id} className="flex items-center gap-4 p-3 bg-green-50 rounded-lg">
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground">
                          {binItem.nombre_producto}
                        </h3>
                        {binItem.variante && (
                          <span className="text-sm text-muted-foreground">
                            {binItem.variante}
                          </span>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-sm text-muted-foreground">SKU: {binItem.sku}</span>
                          <span className="text-sm font-medium text-foreground">
                            Cantidad: {binItem.cantidad}
                          </span>
                        </div>
                      </div>
                      <Button 
                        variant="outline"
                        onClick={() => handleUndoBinItem(binItem.id)}
                      >
                        Deshacer
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
          </div>
        ) : null}
      </div>

      {/* Side panel */}
      <div className="w-80 space-y-4">
        <Card className="p-4 bg-card border-border">
          <h3 className="font-semibold text-foreground mb-3">Información de la Venta</h3>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Cliente:</span>
              <span className="ml-2 text-foreground">{clienteNombre}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total:</span>
              <span className="ml-2 text-foreground">S/ {venta.total}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Estado:</span>
              <span className="ml-2 text-foreground capitalize">{venta.estado}</span>
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-card border-border">
          <h3 className="font-semibold text-foreground mb-3">Progreso del Picking</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Preparados:</span>
              <span className="text-foreground">{preparados.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Pendientes:</span>
              <span className="text-foreground">{noPreparados.length}</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 mt-3">
              <div 
                className="bg-green-600 h-2 rounded-full transition-all"
                style={{ width: `${(preparados.length / binPickingItems.length) * 100}%` }}
              />
            </div>
          </div>

          {pickingCompleted && !venta.url_public_view && venta.estado !== 'archivado' && (
            <div className="mt-4">
              <ClientDocumentPreparation
                ventaId={venta.venta_id}
                clienteInfo={venta.cliente_info || {}}
                documentoTipoSugerido={venta.documento_tipo}
                requiereGuiaRemisionSugerido={venta.requiere_guia_remision}
                onEmitDocument={handleEmitDocumentWithClientInfo}
                isLoading={documentLoading}
              />
            </div>
          )}

          {venta.documento_tipo && !venta.guia_remision && (venta.estado === 'documento_emitido' || (venta.requiere_guia_remision && venta.estado !== 'archivado')) && (
            <Button 
              className="w-full mt-4"
              onClick={() => setShowGuideDialog(true)}
            >
              <Truck className="w-4 h-4 mr-2" />
              Emitir Guía de Remisión
            </Button>
          )}

          {venta.url_public_view && (
            <>
              <Button 
                variant="outline"
                className="w-full mt-2"
                onClick={() => window.open(venta.url_public_view, '_blank')}
              >
                <FileText className="w-4 h-4 mr-2" />
                Ver Documento
              </Button>

            </>
          )}
        </Card>
      </div>

      {/* Guide emission dialog - kept separate as it's used after document emission */}
      <Dialog open={showGuideDialog} onOpenChange={setShowGuideDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Emitir Guía de Remisión</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Se emitirá la guía de remisión y se consumirá el stock reservado.
            </p>
            <div className="p-4 bg-muted rounded-lg">
              <div className="text-sm">
                <div><strong>Documento:</strong> {venta.documento_tipo?.toUpperCase()}</div>
                {venta.serial_number && <div><strong>Número:</strong> {venta.serial_number}</div>}
                <div><strong>Cliente:</strong> {clienteNombre}</div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGuideDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleEmitGuide}
              disabled={guideLoading}
            >
              {guideLoading ? 'Procesando...' : 'Emitir Guía'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TransportistSelectionDialog
        open={showTransportistDialog}
        onOpenChange={setShowTransportistDialog}
        onTransportistSelected={setSelectedTransportista}
        onSendToSunat={handleSendToSunat}
        loading={remissionGuideLoading}
      />
    </div>
  );
}