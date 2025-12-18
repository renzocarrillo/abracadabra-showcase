import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { useFreePickingSession } from '@/hooks/useFreePickingSession';
import { ArrowLeft, Package, Scan, CheckCircle, RefreshCw, Trash2, Minus, AlertTriangle, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ErrorOverlay } from '@/components/ErrorOverlay';
import { SuccessOverlay } from '@/components/SuccessOverlay';
import { FreePickingVerificationView } from '@/components/FreePickingVerificationView';
import { ActivePickingSessions } from '@/components/ActivePickingSessions';
import PinSignatureInput from '@/components/PinSignatureInput';
import { useAuth } from '@/contexts/AuthContext';
import { finalizeSessionWithRetry } from '@/lib/pickingLibreFinalization';

export default function FreePickingMode() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuth();
  const {
    session,
    initializeSession,
    scanBin,
    scanProduct,
    changeCurrentBin,
    startVerification,
    scanProductForVerification,
    attemptToFinish,
    resetSession,
    cancelSession,
    resumeSession,
    removeScannedItem,
    decreaseItemQuantity
  } = useFreePickingSession();

  const [showFinishDialog, setShowFinishDialog] = useState(false);
  const [selectedStore, setSelectedStore] = useState('');
  const [selectedStoreData, setSelectedStoreData] = useState<any>(null);
  const [documentType, setDocumentType] = useState<'traslado_interno' | 'guia_remision'>('traslado_interno');
  const [selectedTransportist, setSelectedTransportist] = useState('');
  const [stores, setStores] = useState<any[]>([]);
  const [transportists, setTransportists] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasAttemptedEmission, setHasAttemptedEmission] = useState(false);
  const [showErrorOverlay, setShowErrorOverlay] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [signatureCompleted, setSignatureCompleted] = useState(false);
  const [signerInfo, setSignerInfo] = useState<{ name: string; timestamp: string; orderId: string } | null>(null);
  const [showVerificationAlert, setShowVerificationAlert] = useState(false);
  const [productosRetiradosPor, setProductosRetiradosPor] = useState('');
  const [availablePickers, setAvailablePickers] = useState<Array<{ id: string; full_name: string }>>([]);
  const [tipoMovimiento, setTipoMovimiento] = useState('');
  // Retry feedback state
  const [retryingMessage, setRetryingMessage] = useState<string | null>(null);
  const [currentAttempt, setCurrentAttempt] = useState(0);

  useEffect(() => {
    loadStoresAndTransportists();
    loadAvailablePickers();
    
    // Cleanup inactive sessions on mount (preventive cleanup)
    const cleanupSessions = async () => {
      try {
        const { data, error } = await supabase.rpc('cleanup_inactive_picking_sessions' as any, { 
          p_minutes: 120 
        });
        if (!error && data && typeof data === 'object' && 'sessions_canceled' in data) {
          const result = data as { sessions_canceled: number };
          if (result.sessions_canceled > 0) {
            console.log(`Cleaned up ${result.sessions_canceled} inactive sessions`);
          }
        }
      } catch (err) {
        console.error('Error cleaning up sessions:', err);
      }
    };
    
    cleanupSessions();
  }, []);

  // Auto-cancel session when component unmounts (user navigates away)
  useEffect(() => {
    const currentSessionId = session?.sessionId;
    const currentStatus = session?.status;
    
    return () => {
      // Only cancel if there was an active session when unmounting
      if (currentSessionId && currentStatus && 
          ['WAITING_FOR_BIN', 'SCANNING_PRODUCTS', 'VERIFICATION_MODE'].includes(currentStatus)) {
        console.log('Session auto-canceled on unmount');
        supabase
          .rpc('cancel_picking_session' as any, { p_session_id: currentSessionId })
          .then(() => {
            localStorage.removeItem('free_picking_session');
          });
      }
    };
  }, []); // Empty array = only runs on mount/unmount

  // Note: Removed beforeunload cancellation as it was interfering with the normal flow
  // when users were trying to finalize sessions through the dialog

  // Update selected store data when store selection changes
  useEffect(() => {
    if (selectedStore) {
      const storeData = stores.find(s => s.id === selectedStore);
      setSelectedStoreData(storeData);
      
      // Reset document type to traslado_interno when changing stores
      setDocumentType('traslado_interno');
    } else {
      setSelectedStoreData(null);
    }
  }, [selectedStore, stores]);

  const loadStoresAndTransportists = async () => {
    const { data: storesData } = await supabase
      .from('tiendas')
      .select('*')
      .order('nombre');

    const { data: transportistsData } = await supabase
      .from('transportistas')
      .select('*')
      .order('nombre_empresa');

    setStores(storesData || []);
    setTransportists(transportistsData || []);
  };

  const loadAvailablePickers = async () => {
    if (!profile) return;
    
    const userType = profile.user_types?.name;
    const isAdminOrSupervisor = userType === 'admin' || userType === 'supervisor';
    
    try {
      if (isAdminOrSupervisor) {
        // Obtener todos los pickers
        const { data: pickersData } = await supabase
          .from('profiles')
          .select(`
            id, 
            full_name,
            user_types!inner(name)
          `)
          .eq('user_types.name', 'picker')
          .is('deleted_at', null)
          .order('full_name');
        
        const pickers = pickersData || [];
        const currentUser = { id: profile.id, full_name: profile.full_name || profile.email };
        
        // Agregar usuario actual si no está en la lista (admin/supervisor)
        const allUsers = pickers.some(p => p.id === profile.id) 
          ? pickers 
          : [currentUser, ...pickers];
        
        setAvailablePickers(allUsers);
        
        // Set default to current user
        if (!productosRetiradosPor) {
          setProductosRetiradosPor(currentUser.full_name);
        }
      } else {
        // Si es picker, mostrar todos los pickers
        const { data: pickersData } = await supabase
          .from('profiles')
          .select(`
            id, 
            full_name,
            user_types!inner(name)
          `)
          .eq('user_types.name', 'picker')
          .is('deleted_at', null)
          .order('full_name');
        
        setAvailablePickers(pickersData || []);
        
        // Set default to current user
        if (!productosRetiradosPor) {
          const currentUser = { id: profile.id, full_name: profile.full_name || profile.email };
          setProductosRetiradosPor(currentUser.full_name);
        }
      }
    } catch (error) {
      console.error('Error loading pickers:', error);
      // Fallback: solo mostrar usuario actual
      const currentUser = { id: profile.id, full_name: profile.full_name || profile.email };
      setAvailablePickers([currentUser]);
      setProductosRetiradosPor(currentUser.full_name);
    }
  };

  const handleScan = async (code: string) => {
    if (!session) return;

    if (session.status === 'WAITING_FOR_BIN') {
      const result = await scanBin(code);
      
      // Show error overlay for invalid bins
      if (!result.success) {
        setErrorMessage(result.error || 'Bin inválido');
        setShowErrorOverlay(true);
      }
    } else if (session.status === 'SCANNING_PRODUCTS') {
      const result = await scanProduct(code);
      
      // 🔴 Show error overlay for ANY product availability issue (including not found)
      if (!result.success && [
        'INSUFFICIENT_STOCK', 
        'NOT_AVAILABLE', 
        'PRODUCT_NOT_FOUND',
        'NO_STOCK_IN_BIN',
        'VARIANT_NOT_FOUND'
      ].includes(result.errorType || '')) {
        setErrorMessage(result.error || 'Producto no disponible en este bin');
        setShowErrorOverlay(true);
      }
    } else if (session.status === 'VERIFICATION_MODE') {
      const result = scanProductForVerification(code);
      
      if (!result.success) {
        let errorMsg = '';
        
        if (result.error === 'PRODUCT_NOT_FOUND') {
          errorMsg = `El producto ${code} no está en esta sesión`;
        } else if (result.error === 'ALREADY_VERIFIED') {
          const item = session.verificationItems?.find(i => i.sku === code);
          errorMsg = `${item?.productName || 'Producto'} ya fue verificado completamente`;
        }
        
        setErrorMessage(errorMsg);
        setShowErrorOverlay(true);
        
        toast({
          title: "ERROR - Escaneo inválido",
          description: errorMsg,
          variant: "destructive"
        });
      } else {
        // Verificar si se completó la verificación después del escaneo exitoso
        const totalItems = session.verificationItems?.length || 0;
        const verifiedItems = session.verificationItems?.filter(item => item.isVerified).length || 0;
        
        if (totalItems > 0 && verifiedItems === totalItems) {
          setShowSuccessOverlay(true);
        }
      }
    }
  };

  const handleFinish = () => {
    setShowVerificationAlert(true);
  };

  const handleConfirmVerification = () => {
    setShowVerificationAlert(false);
    startVerification();
  };

  const handleContinueToDocument = () => {
    // Validar tipo de movimiento
    if (!tipoMovimiento) {
      toast({
        title: "Campo requerido",
        description: "Debes seleccionar el tipo de movimiento",
        variant: "destructive"
      });
      return;
    }

    // Validar productos retirados por
    if (!productosRetiradosPor.trim()) {
      toast({
        title: "Campo requerido",
        description: "Debes seleccionar quién retira los productos",
        variant: "destructive"
      });
      return;
    }

    // Firma es OPCIONAL - solo advertir si no está firmado
    if (!signatureCompleted) {
      toast({
        title: "Advertencia",
        description: "Puedes continuar sin firma, pero es recomendable firmar"
      });
    }
    const result = attemptToFinish();
    
    if (!result.success) {
      if (result.error === 'INCOMPLETE_VERIFICATION') {
        setErrorMessage(`Faltan ${result.unverifiedCount} productos por verificar`);
        setShowErrorOverlay(true);
        
        toast({
          title: "ERROR - Verificación incompleta",
          description: "Debes verificar todos los productos antes de continuar",
          variant: "destructive"
        });
      }
      return;
    }
    
    setShowFinishDialog(true);
  };

  // Limpiar firma si se cancela sin emitir documento
  const handleCancelDialog = async () => {
    if (signatureCompleted && signerInfo) {
      try {
        await supabase
          .from('order_signatures')
          .delete()
          .eq('order_id', signerInfo.orderId)
          .eq('order_type', 'picking_libre');
        
        setSignatureCompleted(false);
        setSignerInfo(null);
        
        toast({
          title: "Firma cancelada",
          description: "La firma ha sido eliminada porque no se emitió el documento"
        });
      } catch (error) {
        console.error('Error deleting signature:', error);
      }
    }
    setShowFinishDialog(false);
  };

  const handleConfirmFinish = async () => {
    console.log('🔵 [STEP 0] ========== INICIO handleConfirmFinish ==========');
    console.log('🔵 [STEP 0] Timestamp:', new Date().toISOString());
    console.log('🔵 [STEP 0] Session ID:', session?.sessionId);
    
    if (!selectedStore) {
      toast({
        title: "Error",
        description: "Debes seleccionar una tienda de destino",
        variant: "destructive"
      });
      return;
    }

    if (documentType === 'guia_remision' && !selectedTransportist) {
      toast({
        title: "Error",
        description: "Debes seleccionar un transportista para guía de remisión",
        variant: "destructive"
      });
      return;
    }

    // 🔒 PREVENCIÓN: Marcar que se intentó emisión (previene doble clic)
    if (hasAttemptedEmission) {
      console.warn('⚠️ Ya se intentó emitir, ignorando segundo intento');
      return;
    }
    
    setIsProcessing(true);
    setHasAttemptedEmission(true);
    setRetryingMessage(null);
    setCurrentAttempt(0);

    try {
      // For external stores, require RUC configured
      if (selectedStoreData && selectedStoreData.pertenenceinnovacion === false) {
        const ruc = (selectedStoreData as any).recipient_ruc;
        if (!ruc) {
          throw new Error('La tienda seleccionada no tiene RUC configurado. Edite la tienda y agregue el RUC para poder emitir.');
        }
      }

      // Guardar información de quien retira productos y tipo de movimiento
      if (productosRetiradosPor.trim() || tipoMovimiento) {
        const { error: updateError } = await supabase
          .from('picking_libre_sessions')
          .update({ 
            productos_retirados_por: productosRetiradosPor.trim(),
            tipo_movimiento: tipoMovimiento
          })
          .eq('id', session!.sessionId);
        
        if (updateError) {
          console.warn('Error updating session metadata:', updateError);
        }
      }

      // 🔄 USE NEW FINALIZATION WRAPPER WITH RETRY LOGIC
      const finalizationResult = await finalizeSessionWithRetry(
        {
          sessionId: session!.sessionId,
          documentType,
          selectedStore,
          selectedTransportist: documentType === 'guia_remision' ? selectedTransportist : null,
          notes: null
        },
        {
          onRetrying: (attempt, reason, delayMs) => {
            setCurrentAttempt(attempt);
            setRetryingMessage(`Reintentando (${attempt}/3): ${reason}. Espera ${Math.round(delayMs / 1000)}s...`);
            
            toast({
              title: "Reintentando...",
              description: `${reason}. Esperando ${delayMs}ms antes de reintentar.`
            });
          },
          onFreshVersionRead: (version) => {
            console.log('📊 Fresh data_version read:', version);
          },
          onSuccess: (result) => {
            setRetryingMessage(null);
            console.log('✅ Finalization successful', result);
          }
        }
      );

      if (!finalizationResult.success) {
        throw new Error(finalizationResult.error || 'Error al finalizar sesión');
      }

      console.log('✅ [FINALIZATION] Exitosa, new_status:', finalizationResult.newStatus);
      setRetryingMessage(null);

      // NOTA: El stock ya está protegido en "comprometido" desde el momento del escaneo
      // No es necesario reservar manualmente - el nuevo flujo protege stock en tiempo real
      console.log('🔵 [STEP 7] Stock ya protegido en comprometido desde el escaneo');

      const finalizeResult = finalizationResult.finalizeData;
      console.log('🔵 [STEP 9] Obteniendo items desde DB...');

      // Get items from database
      const { data: itemsData, error: itemsError } = await supabase
        .from('picking_libre_items')
        .select('sku, quantity, bin_code')
        .eq('session_id', session!.sessionId);

      console.log('🔵 [STEP 9] Items query result:', { hasData: !!itemsData, hasError: !!itemsError, count: itemsData?.length });

      if (itemsError) {
        console.error('❌ [STEP 9] Error obteniendo items:', itemsError);
        throw itemsError;
      }

      if (!itemsData || itemsData.length === 0) {
        console.error('❌ [STEP 9] No hay items en la sesión');
        throw new Error('No hay productos en la sesión para emitir');
      }

      console.log('✅ [STEP 9] Items obtenidos:', itemsData.length);
      console.log('🔵 [STEP 10] Mapeando items...');

      const selectedItems = itemsData.map(item => ({
        sku: item.sku,
        quantity: item.quantity,
        bin: item.bin_code
      }));

      console.log('✅ [STEP 10] Items mapeados:', selectedItems.length);
      console.log('🔵 [STEP 11] Verificando sesión de autenticación...');

      // Emit document to Bsale via edge function
      let emissionResult: any;
      
      // 1. Verify auth session before invoking
      const { data: authSession, error: authError } = await supabase.auth.getSession();
      console.log('🔐 [STEP 11] Auth session check:', { 
        hasSession: !!authSession?.session,
        hasAccessToken: !!authSession?.session?.access_token,
        userId: authSession?.session?.user?.id,
        expiresAt: authSession?.session?.expires_at,
        tokenLength: authSession?.session?.access_token?.length,
        authError: authError?.message,
        authErrorDetails: authError
      });

      if (!authSession?.session?.access_token) {
        console.error('❌ [STEP 11] No hay access_token válido');
        throw new Error('Sesión de autenticación expirada. Por favor, recarga la página e inicia sesión nuevamente.');
      }
      
      console.log('✅ [STEP 11] Sesión de autenticación válida');
      console.log('🔐 [STEP 11] Token (primeros 50):', authSession.session.access_token.substring(0, 50));
      console.log('🔐 [STEP 11] Token (últimos 20):', authSession.session.access_token.substring(authSession.session.access_token.length - 20));
      console.log('🔵 [STEP 10] Determinando tipo de documento:', documentType);
      
      console.log('✅ [STEP 9] Sesión de autenticación válida');
      console.log('🔐 [STEP 9] Token (primeros 50):', authSession.session.access_token.substring(0, 50));
      console.log('🔐 [STEP 9] Token (últimos 20):', authSession.session.access_token.substring(authSession.session.access_token.length - 20));
      console.log('🔵 [STEP 10] Determinando tipo de documento:', documentType);
      
      if (documentType === 'guia_remision') {
        console.log('📋 [STEP 10] Documento: Guía de Remisión');
        // Call remission guide function with enhanced error handling
        console.log('📡 [STEP 11] INICIANDO invocación de edge function: create-free-picking-remission-guide');
        console.log('📦 [STEP 11] Payload:', {
          sessionId: session!.sessionId,
          storeId: selectedStore,
          itemCount: selectedItems.length,
          transportistId: selectedTransportist,
          timestamp: new Date().toISOString()
        });

        let data, error;
        const invokeStartTime = Date.now();

        console.log('🔵 [STEP 12] Creando Promise.race con timeout de 60s...');
        try {
          console.log('🔵 [STEP 13] Ejecutando supabase.functions.invoke...');
          console.log('🌐 [STEP 13] Supabase URL:', (supabase as any).supabaseUrl);
          console.log('🔑 [STEP 13] Usando token de longitud:', authSession.session.access_token.length);
          
          const result = await Promise.race([
            supabase.functions.invoke('create-free-picking-remission-guide', {
              body: {
                sessionId: session!.sessionId,
                storeId: selectedStore,
                selectedItems,
                transportistId: selectedTransportist,
                expectedVersion: finalizeResult.new_version
              }
            }).then(res => {
              console.log('✅ [STEP 13] supabase.functions.invoke completado');
              console.log('📨 [STEP 13] Resultado:', res);
              return res;
            }).catch(err => {
              console.error('❌ [STEP 13] supabase.functions.invoke falló');
              console.error('❌ [STEP 13] Error:', err);
              throw err;
            }),
            new Promise((_, reject) => {
              console.log('⏰ [TIMEOUT] Timeout de 60s iniciado');
              setTimeout(() => {
                console.error('❌ [TIMEOUT] 60 segundos transcurridos');
                reject(new Error('Timeout: El edge function no respondió en 60 segundos'));
              }, 60000);
            })
          ]) as any;

          data = result.data;
          error = result.error;

          console.log('📡 [STEP 14] RESPUESTA de edge function recibida:', {
            duration: Date.now() - invokeStartTime,
            hasError: !!error,
            hasData: !!data,
            error: error ? JSON.stringify(error) : null,
            data: data ? JSON.stringify(data).substring(0, 500) : null
          });

        } catch (invokeError: any) {
          console.error('❌ [STEP 13] ERROR CRÍTICO en invocación:', {
            error: invokeError,
            message: invokeError?.message,
            name: invokeError?.name,
            stack: invokeError?.stack,
            cause: invokeError?.cause,
            duration: Date.now() - invokeStartTime
          });
          throw new Error(`Error de conexión al invocar función: ${invokeError.message}`);
        }

        if (error) {
          console.error('Edge function error object:', error);
          console.error('Edge function data:', data);
          
          const serverMsg = (data as any)?.error || error.message || 'Error desconocido al emitir guía de remisión';
          const serverDetails = (data as any)?.details || '';
          const fullError = serverDetails ? `${serverMsg}\n\nDetalles técnicos: ${serverDetails}` : serverMsg;
          
          throw new Error(fullError);
        }
        
        emissionResult = data;
        
        toast({
          title: "Guía de remisión generada exitosamente",
          description: "El documento ha sido emitido y el stock actualizado",
        });
        
        if (data?.data?.urlPublicView) {
          window.open(data.data.urlPublicView, '_blank');
        }
        
      } else {
        console.log('📋 [STEP 10] Documento: Traslado Interno');
        // Call transfer function with enhanced error handling
        console.log('📡 [STEP 11] INICIANDO invocación de edge function: create-free-picking-transfer');
        console.log('📦 [STEP 11] Payload:', {
          sessionId: session!.sessionId,
          storeId: selectedStore,
          itemCount: selectedItems.length,
          timestamp: new Date().toISOString()
        });

        let data, error;
        const invokeStartTime = Date.now();

        console.log('🔵 [STEP 12] Creando Promise.race con timeout de 60s...');
        try {
          console.log('🔵 [STEP 13] Ejecutando supabase.functions.invoke...');
          console.log('🌐 [STEP 13] Supabase URL:', (supabase as any).supabaseUrl);
          console.log('🔑 [STEP 13] Usando token de longitud:', authSession.session.access_token.length);
          
          const result = await Promise.race([
            supabase.functions.invoke('create-free-picking-transfer', {
              body: {
                sessionId: session!.sessionId,
                storeId: selectedStore,
                selectedItems,
                expectedVersion: finalizeResult.new_version
              }
            }).then(res => {
              console.log('✅ [STEP 13] supabase.functions.invoke completado');
              console.log('📨 [STEP 13] Resultado:', res);
              return res;
            }).catch(err => {
              console.error('❌ [STEP 13] supabase.functions.invoke falló');
              console.error('❌ [STEP 13] Error:', err);
              throw err;
            }),
            new Promise((_, reject) => {
              console.log('⏰ [TIMEOUT] Timeout de 60s iniciado');
              setTimeout(() => {
                console.error('❌ [TIMEOUT] 60 segundos transcurridos');
                reject(new Error('Timeout: El edge function no respondió en 60 segundos'));
              }, 60000);
            })
          ]) as any;

          data = result.data;
          error = result.error;

          console.log('📡 [STEP 14] RESPUESTA de edge function recibida:', {
            duration: Date.now() - invokeStartTime,
            hasError: !!error,
            hasData: !!data,
            error: error ? JSON.stringify(error) : null,
            data: data ? JSON.stringify(data).substring(0, 500) : null
          });

        } catch (invokeError: any) {
          console.error('❌ [STEP 13] ERROR CRÍTICO en invocación:', {
            error: invokeError,
            message: invokeError?.message,
            name: invokeError?.name,
            stack: invokeError?.stack,
            cause: invokeError?.cause,
            duration: Date.now() - invokeStartTime
          });
          throw new Error(`Error de conexión al invocar función: ${invokeError.message}`);
        }

        if (error) {
          console.error('Edge function error object:', error);
          console.error('Edge function data:', data);
          
          const serverMsg = (data as any)?.error || error.message || 'Error desconocido al emitir traslado';
          const serverDetails = (data as any)?.details || '';
          const fullError = serverDetails ? `${serverMsg}\n\nDetalles técnicos: ${serverDetails}` : serverMsg;
          
          throw new Error(fullError);
        }
        
        emissionResult = data;
        
        toast({
          title: "Traslado generado exitosamente",
          description: "El documento ha sido emitido y el stock actualizado",
        });
        
        if (data?.data?.urlPublicView) {
          window.open(data.data.urlPublicView, '_blank');
        }
      }

      console.log('Document emitted successfully:', emissionResult);

      await resetSession();
      navigate('/dashboard');

    } catch (error: any) {
      console.error('❌ ERROR GENERAL al finalizar picking:', {
        error,
        message: error?.message,
        name: error?.name,
        stack: error?.stack,
        cause: error?.cause
      });
      
      // CRÍTICO: Liberar reservas de stock si la emisión falló
      if (session?.sessionId) {
        try {
          console.log('🔄 Liberando reservas de stock debido a error en emisión...');
          const { data: releaseResult, error: releaseError } = await supabase
            .rpc('release_stock_reservation', {
              p_session_id: session.sessionId
            });
          
          if (releaseError) {
            console.error('❌ Error liberando reservas de stock:', releaseError);
          } else {
            console.log('✅ Reservas de stock liberadas:', releaseResult);
          }
        } catch (releaseErr) {
          console.error('❌ Exception al liberar reservas:', releaseErr);
        }
      }
      
      const errorMsg = error?.message || 'Hubo un problema al procesar el traslado';
      
      // Enhanced error handling with better categorization
      let userFriendlyMsg = errorMsg;
      let shouldReload = false;
      
      // Auth/session errors
      if (errorMsg.includes('Sesión de autenticación expirada') || 
          errorMsg.includes('JWT') || 
          errorMsg.includes('token')) {
        userFriendlyMsg = '⚠️ Tu sesión ha expirado. La página se recargará automáticamente para que puedas iniciar sesión nuevamente.';
        shouldReload = true;
      }
      // Timeout errors
      else if (errorMsg.includes('Timeout') || errorMsg.includes('no respondió')) {
        userFriendlyMsg = '⏱️ La operación está tardando demasiado. Verifica tu conexión a internet e intenta nuevamente. Si el problema persiste, la sesión puede haber quedado en estado "emitiendo" y deberás cancelarla.';
      }
      // Network errors
      else if (errorMsg.includes('Error de conexión') || 
               errorMsg.includes('Network') || 
               errorMsg.includes('Failed to fetch')) {
        userFriendlyMsg = '🌐 Error de conexión a internet. Verifica tu conexión e intenta nuevamente.';
      }
      // Version conflict errors
      else if (errorMsg.includes('Conflicto de versión') || 
               errorMsg.includes('modificada por otro usuario')) {
        userFriendlyMsg = '🔄 La sesión fue modificada mientras trabajabas en ella. La página se recargará automáticamente.';
        shouldReload = true;
      }
      // Lock errors
      else if (errorMsg.includes('bloqueada') || errorMsg.includes('otra operación')) {
        userFriendlyMsg = '🔒 La sesión está siendo procesada por otro usuario. Espera unos segundos e intenta nuevamente.';
      }
      // Stock errors
      else if (errorMsg.includes('Stock insuficiente') || 
               errorMsg.includes('Bin congelado') || 
               errorMsg.includes('Producto congelado') ||
               /available quantity/i.test(errorMsg)) {
        userFriendlyMsg = '📦 Hay problemas con el stock de algunos productos. Verifica el inventario antes de continuar.';
      }
      
      toast({
        title: "❌ Error al finalizar",
        description: userFriendlyMsg,
        variant: "destructive",
        duration: shouldReload ? 5000 : 7000
      });

      // Auto-reload on auth/version errors
      if (shouldReload) {
        setTimeout(() => {
          window.location.reload();
        }, 5000);
      }
    } finally {
      setIsProcessing(false);
      // Solo resetear flag en error (en éxito, se navega fuera y se resetea sesión)
      setHasAttemptedEmission(false);
    }
  };

  const handleResumeSession = async (sessionId: string) => {
    const success = await resumeSession(sessionId);
    if (!success) {
      toast({
        title: "Error",
        description: "No se pudo reanudar la sesión",
        variant: "destructive"
      });
      return;
    }

    // Check if session already has a signature
    try {
      const { data: existingSignature, error: sigError } = await supabase
        .from('order_signatures')
        .select('*')
        .eq('order_id', sessionId)
        .eq('order_type', 'picking_libre')
        .maybeSingle();

      if (!sigError && existingSignature) {
        // Session was already signed
        setSignatureCompleted(true);
        setSignerInfo({
          name: existingSignature.signed_by_name,
          timestamp: new Date(existingSignature.signed_at).toLocaleString('es-PE'),
          orderId: sessionId
        });
        
        toast({
          title: "Sesión ya firmada",
          description: `Firmado por ${existingSignature.signed_by_name}`,
        });
      }
    } catch (error) {
      console.error('Error checking signature:', error);
    }
  };

  const handleCancelSessionFromList = async (sessionId: string) => {
    try {
      const { error } = await supabase.rpc('cancel_picking_session' as any, {
        p_session_id: sessionId
      });

      if (error) throw error;

      toast({
        title: "Sesión cancelada",
        description: "La sesión ha sido cancelada correctamente",
      });
    } catch (error) {
      console.error('Error canceling session:', error);
      toast({
        title: "Error",
        description: "No se pudo cancelar la sesión",
        variant: "destructive"
      });
    }
  };

  const handleCleanupAll = async () => {
    try {
      setIsProcessing(true);
      
      toast({
        title: "Limpiando...",
        description: "Liberando stock y eliminando sesiones",
      });

      const { data, error } = await supabase.functions.invoke('cleanup-all-picking-libre');

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "✅ Limpieza completada",
          description: `${data.sessionsDeleted} sesiones eliminadas, ${data.stockReleased} items de stock liberados`,
        });
        
        // Reload to refresh the view
        window.location.reload();
      } else {
        throw new Error(data?.error || 'Error desconocido');
      }
    } catch (error: any) {
      console.error('Error en limpieza:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo completar la limpieza",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!session) {
    return (
      <div className="container mx-auto p-4 md:p-6 space-y-8">
        <Button variant="ghost" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver
        </Button>

        <div className="max-w-2xl mx-auto space-y-8">
          <div className="flex flex-col items-center justify-center space-y-4 px-4">
            <Package className="h-12 w-12 md:h-16 md:w-16 text-muted-foreground" />
            <h2 className="text-xl md:text-2xl font-bold text-foreground">Modo Picking Libre</h2>
            <p className="text-muted-foreground text-center max-w-md text-sm md:text-base">
              Crea traslados escaneando bins y productos directamente, sin pedidos previos
            </p>
            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
              <Button onClick={initializeSession} size="lg" className="flex-1">
                Iniciar Nueva Sesión
              </Button>
              <Button 
                onClick={handleCleanupAll} 
                variant="destructive" 
                size="lg"
                disabled={isProcessing}
                className="flex-1"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Limpiar Todo
              </Button>
            </div>
          </div>

          <ActivePickingSessions
            onResumeSession={handleResumeSession}
            onCancelSession={handleCancelSessionFromList}
          />
        </div>
      </div>
    );
  }

  const totalItems = session.scannedItems.reduce((sum, item) => sum + item.quantity, 0);
  const uniqueProducts = session.scannedItems.length;

  // Mostrar vista de verificación
  if (session.status === 'VERIFICATION_MODE' || session.status === 'VERIFICATION_COMPLETED') {
    return (
      <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
        {showErrorOverlay && (
          <ErrorOverlay 
            message={errorMessage} 
            onClose={() => setShowErrorOverlay(false)} 
          />
        )}
        
        {showSuccessOverlay && (
          <SuccessOverlay 
            message="Todos los productos verificados" 
            onClose={() => setShowSuccessOverlay(false)} 
          />
        )}

        <div className="flex items-center gap-2 md:gap-4 mb-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver
          </Button>
          <div>
            <h2 className="text-lg md:text-xl font-semibold text-foreground">Verificación de Picking</h2>
            <p className="text-xs md:text-sm text-muted-foreground">
              {session.status === 'VERIFICATION_MODE' ? 'Escanea todos los productos para verificar' : 'Verificación completada'}
            </p>
          </div>
        </div>

        <FreePickingVerificationView
          verificationItems={session.verificationItems || []}
          onScan={handleScan}
          isCompleted={session.status === 'VERIFICATION_COMPLETED'}
        />

        {session.status === 'VERIFICATION_COMPLETED' && (
          <div className="max-w-2xl mx-auto space-y-4">
            {/* Tipo de movimiento dropdown */}
            <Card className="p-4">
              <label className="text-sm font-medium text-foreground mb-2 block">
                Tipo de movimiento <span className="text-destructive">*</span>
              </label>
              <Select 
                value={tipoMovimiento} 
                onValueChange={setTipoMovimiento}
              >
                <SelectTrigger className="w-full bg-background">
                  <SelectValue placeholder="Seleccionar tipo de movimiento..." />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="venta_directa">Venta directa</SelectItem>
                  <SelectItem value="reposicion">Reposición</SelectItem>
                  <SelectItem value="traslado">Traslado</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-2">
                Selecciona el tipo de movimiento de productos
              </p>
            </Card>

            {/* Productos retirados por dropdown */}
            <Card className="p-4">
              <label className="text-sm font-medium text-foreground mb-2 block">
                Productos retirados por <span className="text-destructive">*</span>
              </label>
              <Select 
                value={productosRetiradosPor} 
                onValueChange={setProductosRetiradosPor}
              >
                <SelectTrigger className="w-full bg-background">
                  <SelectValue placeholder="Seleccionar persona..." />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {availablePickers.map((picker) => (
                    <SelectItem key={picker.id} value={picker.full_name}>
                      {picker.id === profile?.id ? (
                        <div className="flex items-center gap-2">
                          <span>{picker.full_name}</span>
                          <Badge variant="outline" className="text-xs">Yo</Badge>
                        </div>
                      ) : (
                        picker.full_name
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-2">
                Nombre de la persona que físicamente retira los productos
              </p>
            </Card>

            {!signatureCompleted ? (
              <Card className="bg-accent/50 border-2 border-primary/30 shadow-lg">
                <div className="p-6">
                  <h3 className="text-lg font-semibold mb-4 text-foreground">Firma Digital (Opcional)</h3>
                  <div className="mb-4">
                    <p className="text-sm text-muted-foreground mb-2">
                      ⚠️ La firma es <strong>opcional</strong> pero recomendada para mantener trazabilidad
                    </p>
                  </div>
                  <PinSignatureInput
                    orderId={session.sessionId || ''}
                    orderCode={`PL-${session.sessionId?.slice(0, 8)}`}
                    orderType="picking_libre"
                    onSignSuccess={async (signerName, signedAt) => {
                      setSignerInfo({ 
                        name: signerName, 
                        timestamp: signedAt,
                        orderId: session.sessionId || ''
                      });
                      setSignatureCompleted(true);
                      
                      toast({
                        title: "Firmado correctamente",
                        description: "La firma ha sido registrada exitosamente"
                      });
                    }}
                    showNotesField={true}
                  />
                  <div className="mt-4 pt-4 border-t">
                    <Button
                      onClick={handleContinueToDocument}
                      variant="outline"
                      className="w-full"
                      size="lg"
                    >
                      Continuar sin firmar
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              <Card className="bg-green-50 dark:bg-green-950/20 border-2 border-green-200 dark:border-green-800 shadow-lg">
                <div className="p-6">
                  <div className="text-center mb-6">
                    <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-3" />
                    <h3 className="text-lg font-semibold text-green-800 dark:text-green-400 mb-2">
                      Firmado Correctamente
                    </h3>
                    <p className="text-sm text-green-700 dark:text-green-300">
                      Por: <strong>{signerInfo?.name}</strong>
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      {signerInfo?.timestamp && new Date(signerInfo.timestamp).toLocaleString('es-PE')}
                    </p>
                  </div>
                  <Button
                    onClick={handleContinueToDocument}
                    className="w-full"
                    size="lg"
                  >
                    Continuar a Emisión de Documento
                  </Button>
                </div>
              </Card>
            )}
          </div>
        )}

        <Dialog open={showFinishDialog} onOpenChange={setShowFinishDialog}>
          <DialogContent className="max-w-[95vw] md:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base md:text-lg">Finalizar Picking y Emitir Documento</DialogTitle>
              <DialogDescription>Revisa destino y tipo de documento antes de emitir.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground">Tienda de Destino</label>
                <Select value={selectedStore} onValueChange={setSelectedStore}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar tienda" />
                  </SelectTrigger>
                <SelectContent>
                  {stores
                    .filter(store => store.nombre !== 'ALMCENTRAL')
                    .map(store => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.nombre}
                      </SelectItem>
                    ))}
                </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">Tipo de Documento</label>
                <Select 
                  value={documentType} 
                  onValueChange={(value: any) => setDocumentType(value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="traslado_interno">Traslado Interno</SelectItem>
                    {selectedStoreData?.pertenenceinnovacion === true && (
                      <SelectItem value="guia_remision">Guía de Remisión</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {selectedStoreData && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {selectedStoreData.pertenenceinnovacion
                      ? "Traslado interno entre oficinas de Innovación (no requiere RUC)."
                      : (selectedStoreData.recipient_ruc
                          ? `Traslado externo. RUC destino: ${selectedStoreData.recipient_ruc}.`
                          : "Traslado externo: falta configurar el RUC del destino.")}
                  </p>
                )}
              </div>

              {documentType === 'guia_remision' && (
                <div>
                  <label className="text-sm font-medium text-foreground">Transportista</label>
                  <Select value={selectedTransportist} onValueChange={setSelectedTransportist}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar transportista" />
                    </SelectTrigger>
                    <SelectContent>
                      {transportists.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.nombre_empresa} - RUC: {t.ruc}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Retry feedback message */}
            {isProcessing && retryingMessage && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-4">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    {retryingMessage}
                  </p>
                </div>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Esto es normal cuando hay múltiples operaciones simultáneas.
                </p>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleCancelDialog} disabled={isProcessing}>
                Cancelar
              </Button>
              <Button onClick={handleConfirmFinish} disabled={isProcessing}>
                {isProcessing ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {retryingMessage ? `Reintentando (${currentAttempt}/3)...` : 'Procesando...'}
                  </span>
                ) : 'Emitir Documento'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
      {showErrorOverlay && (
        <ErrorOverlay 
          message={errorMessage} 
          onClose={() => setShowErrorOverlay(false)} 
        />
      )}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-2 md:gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver
          </Button>
          <div>
            <h2 className="text-lg md:text-xl font-semibold text-foreground">Picking Libre</h2>
            <p className="text-xs md:text-sm text-muted-foreground">
              {totalItems} productos ({uniqueProducts} únicos)
            </p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <Button 
            variant="outline" 
            onClick={async () => {
              await cancelSession();
              navigate('/dashboard');
            }} 
            className="w-full sm:w-auto"
          >
            Cancelar Sesión
          </Button>
          <Button variant="outline" onClick={changeCurrentBin} className="w-full sm:w-auto">
            <RefreshCw className="mr-2 h-4 w-4" />
            Cambiar Bin
          </Button>
          <Button onClick={handleFinish} disabled={totalItems === 0} className="w-full sm:w-auto">
            <CheckCircle className="mr-2 h-4 w-4" />
            Finalizar
          </Button>
        </div>
      </div>

      <Card className="p-4 md:p-6 bg-card border-border">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Scan className="h-5 w-5 text-primary flex-shrink-0" />
            <h3 className="font-medium text-foreground text-sm md:text-base">
              {session.status === 'WAITING_FOR_BIN' 
                ? 'Escanea un Bin' 
                : `Bin: ${session.currentBin} - Escanea productos`}
            </h3>
          </div>

          <BarcodeScanner
            onScan={handleScan}
            placeholder={
              session.status === 'WAITING_FOR_BIN'
                ? 'Escanea código del bin...'
                : 'Escanea código de producto...'
            }
            disabled={false}
          />
        </div>
      </Card>

      {session.scannedItems.length > 0 && (
        <Card className="p-4 md:p-6 bg-card border-border">
          <h3 className="font-medium mb-4 text-foreground text-sm md:text-base">Productos Escaneados</h3>
          <div className="space-y-2">
            {session.scannedItems.map((item, index) => (
              <div key={index} className="flex justify-between items-center p-3 bg-muted rounded-lg gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground text-sm md:text-base truncate">{item.productName}</p>
                  <p className="text-xs md:text-sm text-muted-foreground break-words">
                    SKU: {item.sku} | Bin: {item.binCode}
                    {item.variante && ` | ${item.variante}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <p className="font-bold text-foreground text-sm md:text-base">x{item.quantity}</p>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => decreaseItemQuantity(item.sku, item.binCode)}
                      title="Reducir cantidad"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => removeScannedItem(item.sku, item.binCode)}
                      title="Eliminar producto"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <AlertDialog open={showVerificationAlert} onOpenChange={setShowVerificationAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Iniciar Verificación
            </AlertDialogTitle>
            <AlertDialogDescription>
              Una vez iniciada la verificación, <strong>no podrás modificar</strong> los productos escaneados. 
              Asegúrate de que todos los productos y cantidades sean correctos antes de continuar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmVerification}>
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
