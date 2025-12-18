import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { audioService } from '@/lib/audioService';
import { getDeviceId, isCurrentDevice } from '@/lib/deviceId';
export type FreePickingStatus = 
  | 'WAITING_FOR_BIN' 
  | 'SCANNING_PRODUCTS' 
  | 'VERIFICATION_MODE'
  | 'VERIFICATION_COMPLETED'
  | 'READY_TO_FINISH';

export interface ScannedFreeItem {
  id?: string;
  sku: string;
  binCode: string;
  quantity: number;
  productName: string;
  variante?: string;
  scannedAt: string;
  stockId: string;
}

export interface FreeVerificationItem {
  sku: string;
  productName: string;
  variante?: string;
  totalQuantity: number;
  verifiedQuantity: number;
  isVerified: boolean;
  bins: string[];
}

export interface FreePickingSession {
  sessionId: string | null;
  currentBin: string | null;
  scannedItems: ScannedFreeItem[];
  status: FreePickingStatus;
  startedAt: string;
  verificationItems?: FreeVerificationItem[];
  verificationStartedAt?: string;
  verificationCompletedAt?: string;
}

// Tipos para la respuesta del RPC scan_product_unified (formato plano snake_case)
interface ScanProductUnifiedSuccess {
  success: true;
  action: 'created' | 'incremented';
  item_id: string;
  sku: string;
  bin_code: string;
  nombre_producto: string;
  variante: string | null;
  quantity?: number;       // Solo en action 'created'
  new_quantity?: number;   // Solo en action 'incremented'
  stock_id: string;
}

interface ScanProductUnifiedError {
  success: false;
  error: string;
  message?: string;
  details?: string;
}

type ScanProductUnifiedResponse = ScanProductUnifiedSuccess | ScanProductUnifiedError;

export function useFreePickingSession() {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [session, setSession] = useState<FreePickingSession | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Función para reproducir sonido de beep cuando se escanea un producto
  const playSuccessBeep = () => {
    audioService.playSuccessBeep();
  };

  const initializeSession = async () => {
    if (!user) {
      toast({ title: "Error", description: "Usuario no autenticado", variant: "destructive" });
      return;
    }

    const deviceId = getDeviceId();

    try {
      const { data, error } = await supabase
        .from('picking_libre_sessions')
        .insert({
          created_by: user.id,
          created_by_name: profile?.full_name || user.email || 'Usuario',
          status: 'en_proceso',
          device_id: deviceId
        })
        .select()
        .single();

      if (error) throw error;

      const newSession: FreePickingSession = {
        sessionId: data.id,
        currentBin: null,
        scannedItems: [],
        status: 'WAITING_FOR_BIN',
        startedAt: new Date().toISOString()
      };

      setSession(newSession);
      saveSessionToStorage(newSession);

      toast({
        title: "Sesión iniciada",
        description: "Comienza escaneando un bin",
      });
    } catch (error: any) {
      console.error('Error initializing session:', error);
      toast({
        title: "Error",
        description: "No se pudo iniciar la sesión",
        variant: "destructive"
      });
    }
  };

  const scanBin = async (binCode: string): Promise<{ success: boolean; error?: string }> => {
    if (!session) return { success: false };

    try {
      // Validate that bin exists
      const { data: validation, error: validationError } = await supabase
        .rpc('validate_bin_exists', { p_bin_code: binCode });

      if (validationError) throw validationError;

      const validationResult = validation as any;

      if (!validationResult.exists) {
        toast({
          title: "Bin no encontrado",
          description: validationResult.message,
          variant: "destructive"
        });
        return { success: false, error: validationResult.message };
      }

      if (validationResult.is_frozen) {
        toast({
          title: "Bin congelado",
          description: validationResult.message,
          variant: "destructive"
        });
        return { success: false, error: validationResult.message };
      }

      // Touch session to keep it active (trigger will update totals automatically)
      await supabase
        .from('picking_libre_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', session.sessionId);

      setSession(prev => ({
        ...prev!,
        currentBin: binCode,
        status: 'SCANNING_PRODUCTS' as FreePickingStatus
      }));

      toast({
        title: "Bin escaneado",
        description: `Ahora escanea productos del bin ${binCode}`,
      });

      return { success: true };
    } catch (error) {
      console.error('Error validating bin:', error);
      toast({
        title: "Error",
        description: "No se pudo validar el bin",
        variant: "destructive"
      });
      return { success: false, error: 'Error al validar bin' };
    }
  };

  // Recargar sesión completa desde la BD (única fuente de verdad)
  const reloadSessionFromDB = async (sessionId: string): Promise<ScannedFreeItem[]> => {
    const { data: itemsData, error: itemsError } = await supabase
      .from('picking_libre_items')
      .select('*')
      .eq('session_id', sessionId)
      .order('scanned_at', { ascending: true });

    if (itemsError) throw itemsError;

    return itemsData.map(item => ({
      id: item.id,
      sku: item.sku,
      binCode: item.bin_code,
      quantity: item.quantity,
      productName: item.nombre_producto,
      variante: item.variante || undefined,
      scannedAt: item.scanned_at || new Date().toISOString(),
      stockId: item.stock_id || ''
    }));
  };

  const scanProduct = async (scannedSku: string): Promise<{ success: boolean; error?: string; errorType?: string }> => {
    if (!session || !session.currentBin || isSyncing) {
      return { success: false };
    }

    // GUARD CLAUSE: Solo permitir escaneos en estado SCANNING_PRODUCTS
    if (session.status !== 'SCANNING_PRODUCTS') {
      toast({
        title: "Operación no permitida",
        description: "No se pueden escanear productos en el estado actual",
        variant: "destructive",
      });
      return { success: false, error: "INVALID_STATE" };
    }

    setIsSyncing(true);

    try {
      // Llamada única al RPC unificado - enviamos el bin actual para que el RPC lo use directamente
      const { data, error } = await supabase.rpc('scan_product_unified', {
        p_session_id: session.sessionId,
        p_scanned_code: scannedSku,
        p_bin_code: session.currentBin,
      });

      if (error) {
        console.error('Error scanning product:', error);
        toast({
          title: "Error",
          description: "Error al escanear producto",
          variant: "destructive",
        });
        return { success: false };
      }

      // Tipar la respuesta del RPC
      const response = data as unknown as ScanProductUnifiedResponse;

      if (!response.success) {
        // TypeScript type guard: ahora sabemos que es ScanProductUnifiedError
        const errorResponse = response as ScanProductUnifiedError;
        
        // Manejar errores específicos del RPC
        // Mapa completo de errores conocidos del RPC scan_product_unified
        const errorMessages: Record<string, string> = {
          // Errores de autenticación/sesión
          'UNAUTHORIZED': 'Usuario no autenticado',
          'SESSION_INVALID': 'Sesión inválida o no encontrada',
          'SESSION_PERMISSION': 'No tienes permiso para esta sesión',
          'SESSION_CLOSED': 'La sesión ya no está activa',
          'SESSION_EXPIRED': 'La sesión ha expirado por inactividad',
          
          // Errores de producto
          'PRODUCT_NOT_FOUND': 'Producto no encontrado en el sistema',
          'PRODUCT_FROZEN': 'Este producto está congelado y no puede ser escaneado',
          'NOT_AVAILABLE': 'Producto no disponible en este bin',
          'VARIANT_NOT_FOUND': 'Variante de producto no encontrada',
          
          // Errores de stock
          'INSUFFICIENT_STOCK': 'Stock insuficiente para escanear más unidades',
          'NO_STOCK_IN_BIN': 'No hay stock de este producto en el bin actual',
          'STOCK_RESERVED': 'El stock está reservado para otra operación',
          'NO_RESERVED_STOCK': 'No hay stock reservado disponible',
          'STOCK_RACE_CONDITION': 'El stock fue tomado por otro picker',
          'STOCK_LOCKED': 'El stock está siendo procesado por otro usuario',
          
          // Errores de bin
          'NO_BIN_SCANNED': 'Debes escanear un bin primero',
          'BIN_NOT_FOUND': 'Bin no encontrado',
          'BIN_FROZEN': 'El bin está congelado',
          
          // Errores de duplicados/límites
          'ALREADY_SCANNED': 'Este producto ya fue escaneado en este bin',
          'MAX_QUANTITY_REACHED': 'Se alcanzó la cantidad máxima disponible',
          'DUPLICATE_SCAN': 'Escaneo duplicado detectado',
          
          // Errores de concurrencia
          'CONCURRENT_MODIFICATION': 'Conflicto de edición, intenta de nuevo',
          'LOCK_TIMEOUT': 'Timeout al procesar, intenta de nuevo',
        };

        // Construir mensaje de error con fallbacks progresivos
        let errorMessage: string;
        
        if (errorMessages[errorResponse.error]) {
          // 1. Usar mensaje del mapa si existe
          errorMessage = errorMessages[errorResponse.error];
        } else if (errorResponse.message && errorResponse.message !== errorResponse.error) {
          // 2. Usar message del RPC si es diferente al código de error
          errorMessage = errorResponse.message;
        } else if (errorResponse.details) {
          // 3. Usar details si existe (para errores con información adicional)
          errorMessage = errorResponse.details;
        } else if (errorResponse.error) {
          // 4. Mostrar el código de error como último recurso útil
          errorMessage = `Error: ${errorResponse.error}`;
        } else {
          // 5. Fallback genérico solo si no hay nada más
          errorMessage = 'Error desconocido al procesar el escaneo';
        }

        // Log detallado para debugging
        console.warn('[scanProduct] Error RPC:', {
          errorCode: errorResponse.error,
          message: errorResponse.message,
          details: errorResponse.details,
          resolvedMessage: errorMessage
        });

        toast({
          title: "Error al escanear",
          description: errorMessage,
          variant: "destructive",
        });

        // Si la sesión es inválida o no tiene permisos, resetear
        if (['SESSION_INVALID', 'SESSION_CLOSED', 'SESSION_PERMISSION', 'UNAUTHORIZED'].includes(errorResponse.error)) {
          await resetSession();
        }

        return { 
          success: false, 
          error: errorMessage, 
          errorType: errorResponse.error 
        };
      }

      // TypeScript type guard: ahora sabemos que es ScanProductUnifiedSuccess
      const successResponse = response as ScanProductUnifiedSuccess;
      
      // Log para debugging
      console.log('[scanProduct] RPC success response:', successResponse);
      
      // Mapear respuesta snake_case del RPC a formato camelCase esperado por updateItemInMemory
      const mappedItem: ScannedFreeItem = {
        id: successResponse.item_id,
        sku: successResponse.sku,
        binCode: successResponse.bin_code,
        quantity: successResponse.action === 'incremented' 
          ? successResponse.new_quantity! 
          : successResponse.quantity!,
        productName: successResponse.nombre_producto,
        variante: successResponse.variante || undefined,
        scannedAt: new Date().toISOString(),
        stockId: successResponse.stock_id
      };
      
      // Actualizar estado en memoria con el item mapeado
      updateItemInMemory(mappedItem);
      playSuccessBeep();
      
      return { success: true };
    } catch (error: any) {
      console.error('Error scanning product:', error);
      toast({
        title: "Error",
        description: "Error inesperado al escanear producto",
        variant: "destructive",
      });
      return { success: false };
    } finally {
      setIsSyncing(false);
    }
  };

  // Actualizar un item en memoria sin recargar toda la sesión
  const updateItemInMemory = (itemData: any) => {
    setSession(prev => {
      if (!prev) return prev;
      
      const existingIndex = prev.scannedItems.findIndex(
        i => i.sku === itemData.sku && i.binCode === itemData.binCode
      );

      const newItem: ScannedFreeItem = {
        id: itemData.id,
        sku: itemData.sku,
        binCode: itemData.binCode,
        quantity: itemData.quantity,
        productName: itemData.productName,
        variante: itemData.variante,
        scannedAt: itemData.scannedAt,
        stockId: itemData.stockId
      };

      const updatedItems = existingIndex >= 0
        ? prev.scannedItems.map((item, i) => i === existingIndex ? newItem : item)
        : [...prev.scannedItems, newItem];

      const updatedSession = { 
        ...prev, 
        scannedItems: updatedItems 
      };
      
      saveSessionToStorage(updatedSession);
      return updatedSession;
    });
  };

  const changeCurrentBin = () => {
    if (!session) return;

    setSession({
      ...session,
      currentBin: null,
      status: 'WAITING_FOR_BIN'
    });

    toast({
      title: "Cambio de bin",
      description: "Escanea un nuevo bin para continuar",
    });
  };

  // Función reutilizable para construir verificationItems desde scannedItems
  const buildVerificationItems = (scannedItems: ScannedFreeItem[]): FreeVerificationItem[] => {
    const verificationMap = new Map<string, FreeVerificationItem>();

    scannedItems.forEach(item => {
      const existing = verificationMap.get(item.sku);
      if (existing) {
        existing.totalQuantity += item.quantity;
        if (!existing.bins.includes(item.binCode)) {
          existing.bins.push(item.binCode);
        }
      } else {
        verificationMap.set(item.sku, {
          sku: item.sku,
          productName: item.productName,
          variante: item.variante,
          totalQuantity: item.quantity,
          verifiedQuantity: 0,
          isVerified: false,
          bins: [item.binCode]
        });
      }
    });

    return Array.from(verificationMap.values());
  };

  const startVerification = () => {
    if (!session || session.scannedItems.length === 0) {
      toast({
        title: "Error",
        description: "No hay productos escaneados",
        variant: "destructive"
      });
      return false;
    }

    const updatedSession = {
      ...session,
      status: 'VERIFICATION_MODE' as FreePickingStatus,
      verificationItems: buildVerificationItems(session.scannedItems),
      verificationStartedAt: new Date().toISOString()
    };

    setSession(updatedSession);
    saveSessionToStorage(updatedSession);

    toast({
      title: "Modo verificación",
      description: "Escanea todos los productos para verificar el conteo",
    });

    return true;
  };

  const scanProductForVerification = (scannedSku: string): { success: boolean; error?: string } => {
    if (!session || session.status !== 'VERIFICATION_MODE' || !session.verificationItems) {
      return { success: false, error: 'INVALID_STATE' };
    }

    const itemIndex = session.verificationItems.findIndex(
      item => item.sku === scannedSku
    );

    // ERROR: Producto no está en la lista
    if (itemIndex === -1) {
      return { 
        success: false, 
        error: 'PRODUCT_NOT_FOUND',
      };
    }

    const item = session.verificationItems[itemIndex];

    // ERROR: Ya se verificó completamente este producto
    if (item.verifiedQuantity >= item.totalQuantity) {
      return { 
        success: false, 
        error: 'ALREADY_VERIFIED',
      };
    }

    // Escaneo válido
    const updatedSession = { ...session };
    updatedSession.verificationItems![itemIndex].verifiedQuantity += 1;

    if (updatedSession.verificationItems![itemIndex].verifiedQuantity >= 
        updatedSession.verificationItems![itemIndex].totalQuantity) {
      updatedSession.verificationItems![itemIndex].isVerified = true;
    }

    // Verificar si todos los productos están completos
    const allVerified = updatedSession.verificationItems!.every(item => item.isVerified);

    // Reproducir sonido de éxito al verificar
    playSuccessBeep();

    if (allVerified) {
      updatedSession.status = 'VERIFICATION_COMPLETED';
      updatedSession.verificationCompletedAt = new Date().toISOString();
      
      toast({
        title: "✅ Verificación completada",
        description: "Todos los productos fueron verificados correctamente",
      });
    } else {
      toast({
        title: "Producto verificado",
        description: `${item.productName} - ${updatedSession.verificationItems![itemIndex].verifiedQuantity}/${item.totalQuantity}`,
      });
    }

    setSession(updatedSession);
    saveSessionToStorage(updatedSession);
    return { success: true };
  };

  const attemptToFinish = (): { success: boolean; error?: string; unverifiedCount?: number } => {
    if (!session) return { success: false, error: 'NO_SESSION' };

    // ERROR: Intentar finalizar sin verificar todo
    if (session.status === 'VERIFICATION_MODE' && session.verificationItems) {
      const unverified = session.verificationItems.filter(item => !item.isVerified);
      
      if (unverified.length > 0) {
        return { 
          success: false, 
          error: 'INCOMPLETE_VERIFICATION',
          unverifiedCount: unverified.length
        };
      }
    }

    // Solo permitir continuar si la verificación está completa
    // NO cambiamos el status - permanece en VERIFICATION_COMPLETED
    if (session.status === 'VERIFICATION_COMPLETED') {
      return { success: true };
    }

    return { success: false, error: 'INVALID_STATE' };
  };

  const cancelSession = async () => {
    if (session?.sessionId) {
      try {
        const { error } = await supabase.rpc('cancel_picking_session' as any, {
          p_session_id: session.sessionId
        });
        if (error) console.error('Error canceling session:', error);
      } catch (error) {
        console.error('Error canceling session:', error);
      }
    }

    localStorage.removeItem('free_picking_session');
    setSession(null);
  };

  const resetSession = async () => {
    await cancelSession();
  };

  // localStorage solo guarda metadatos (currentBin, status) NO items (esos vienen de BD)
  const saveSessionToStorage = (sessionData: FreePickingSession) => {
    const metadataOnly = {
      sessionId: sessionData.sessionId,
      currentBin: sessionData.currentBin,
      status: sessionData.status,
      startedAt: sessionData.startedAt,
      verificationStartedAt: sessionData.verificationStartedAt,
      verificationCompletedAt: sessionData.verificationCompletedAt,
      // NO guardar scannedItems ni verificationItems - se recargan desde BD
    };
    localStorage.setItem('free_picking_session', JSON.stringify(metadataOnly));
  };

  const loadSessionFromStorage = async () => {
    const saved = localStorage.getItem('free_picking_session');
    if (saved) {
      try {
        const sessionMetadata = JSON.parse(saved);
        
        // Si hay sessionId, recargar items desde BD
        if (sessionMetadata.sessionId) {
          const reloadedItems = await reloadSessionFromDB(sessionMetadata.sessionId);
          
          // NUEVO: Reconstruir verificationItems si estamos en modo verificación
          let verificationItems: FreeVerificationItem[] | undefined;
          
          if (sessionMetadata.status === 'VERIFICATION_MODE' || 
              sessionMetadata.status === 'VERIFICATION_COMPLETED') {
            // Reconstruir desde scannedItems (BD es única fuente de verdad)
            verificationItems = buildVerificationItems(reloadedItems);
            
            // OPCIÓN A: Si estaba COMPLETED, marcar todo como verificado
            // Si no (VERIFICATION_MODE), reiniciar progreso (verifiedQuantity = 0)
            if (sessionMetadata.status === 'VERIFICATION_COMPLETED') {
              verificationItems.forEach(item => {
                item.verifiedQuantity = item.totalQuantity;
                item.isVerified = true;
              });
            }
            // Si status === VERIFICATION_MODE, verifiedQuantity ya es 0 por buildVerificationItems
          }
          
          const sessionData = {
            ...sessionMetadata,
            scannedItems: reloadedItems,
            verificationItems
          };
          setSession(sessionData);
          return sessionData;
        }
        
        setSession(sessionMetadata);
        return sessionMetadata;
      } catch (error) {
        console.error('Error loading session from storage:', error);
      }
    }
    return null;
  };

  const resumeSession = async (sessionId: string) => {
    if (!user) {
      toast({ title: "Error", description: "Usuario no autenticado", variant: "destructive" });
      return false;
    }

    try {
      // Load session from DB
      const { data: sessionData, error: sessionError } = await supabase
        .from('picking_libre_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('created_by', user.id)
        .eq('status', 'en_proceso')
        .single();

      if (sessionError) throw sessionError;

      // Check if session is from another device
      const sessionDeviceId = (sessionData as any).device_id;
      const isFromOtherDevice = sessionDeviceId && !isCurrentDevice(sessionDeviceId);
      
      if (isFromOtherDevice) {
        console.log('📱 Taking control of session from another device');
        
        // Update device_id to current device
        const { error: updateError } = await supabase
          .from('picking_libre_sessions')
          .update({ 
            device_id: getDeviceId(),
            updated_at: new Date().toISOString()
          })
          .eq('id', sessionId);
        
        if (updateError) {
          console.error('Error updating device_id:', updateError);
        }
        
        toast({
          title: "Control transferido",
          description: "Esta sesión ahora está activa en este dispositivo",
        });
      }

      // Recargar items desde BD (única fuente de verdad)
      const scannedItems = await reloadSessionFromDB(sessionId);

      // Determine session status based on items
      let status: FreePickingStatus = 'WAITING_FOR_BIN';
      let verificationItems: FreeVerificationItem[] | undefined;
      
      if (scannedItems.length > 0) {
        // If items exist, assume they were in verification mode
        // Consolidate items for verification
        const itemsMap = new Map<string, FreeVerificationItem>();
        
        scannedItems.forEach(item => {
          const key = item.sku;
          if (itemsMap.has(key)) {
            const existing = itemsMap.get(key)!;
            existing.totalQuantity += item.quantity;
            existing.verifiedQuantity += item.quantity; // Mark as verified since they were already scanned
            if (!existing.bins.includes(item.binCode)) {
              existing.bins.push(item.binCode);
            }
          } else {
            itemsMap.set(key, {
              sku: item.sku,
              productName: item.productName,
              variante: item.variante,
              totalQuantity: item.quantity,
              verifiedQuantity: item.quantity, // Mark as verified
              isVerified: true, // Mark as verified
              bins: [item.binCode]
            });
          }
        });
        
        verificationItems = Array.from(itemsMap.values());
        status = 'VERIFICATION_COMPLETED'; // Set to completed since items were already scanned
      }

      const resumedSession: FreePickingSession = {
        sessionId: sessionData.id,
        currentBin: null,
        scannedItems,
        status,
        startedAt: sessionData.created_at,
        verificationItems,
        verificationStartedAt: sessionData.created_at,
        verificationCompletedAt: new Date().toISOString()
      };

      setSession(resumedSession);
      saveSessionToStorage(resumedSession);

      toast({
        title: "Sesión reanudada",
        description: `${scannedItems.length} productos cargados`,
      });

      return true;
    } catch (error) {
      console.error('Error resuming session:', error);
      toast({
        title: "Error",
        description: "No se pudo reanudar la sesión",
        variant: "destructive"
      });
      return false;
    }
  };

  const removeScannedItem = async (sku: string, binCode: string) => {
    if (!session || !session.sessionId) return;

    // Bloquear operaciones concurrentes
    if (isSyncing) {
      toast({
        title: "Procesando",
        description: "Espera a que termine la operación anterior",
        variant: "destructive"
      });
      return;
    }

    setIsSyncing(true);

    try {
      // NUEVO: Usar RPC que libera stock de comprometido → disponibles
      const { data, error } = await supabase.rpc('remove_picking_libre_item', {
        p_session_id: session.sessionId,
        p_sku: sku,
        p_bin_code: binCode
      });

      if (error) throw error;

      const result = data as any;
      if (!result?.success) {
        throw new Error(result?.error || 'Error al eliminar item');
      }

      // Recargar desde BD para sincronizar
      const reloadedItems = await reloadSessionFromDB(session.sessionId);

      const updatedSession = {
        ...session,
        scannedItems: reloadedItems
      };

      setSession(updatedSession);
      saveSessionToStorage(updatedSession);

      toast({
        title: "Producto eliminado",
        description: `Stock liberado: ${result.released_quantity} unidad(es)`,
      });
    } catch (error) {
      console.error('Error removing item:', error);
      toast({
        title: "Error",
        description: "No se pudo eliminar el producto",
        variant: "destructive"
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const decreaseItemQuantity = async (sku: string, binCode: string) => {
    if (!session || !session.sessionId) return;

    // Bloquear operaciones concurrentes
    if (isSyncing) {
      toast({
        title: "Procesando",
        description: "Espera a que termine la operación anterior",
        variant: "destructive"
      });
      return;
    }

    setIsSyncing(true);

    try {
      // Operación atómica: decrementar quantity en la BD
      const { error } = await supabase.rpc('decrement_picking_item_quantity', {
        p_session_id: session.sessionId,
        p_sku: sku,
        p_bin_code: binCode
      });

      if (error) throw error;

      // Recargar desde BD para sincronizar
      const reloadedItems = await reloadSessionFromDB(session.sessionId);

      const updatedSession = {
        ...session,
        scannedItems: reloadedItems
      };

      setSession(updatedSession);
      saveSessionToStorage(updatedSession);

      const newItem = reloadedItems.find(i => i.sku === sku && i.binCode === binCode);
      
      toast({
        title: "Cantidad reducida",
        description: newItem ? `Nueva cantidad: ${newItem.quantity}` : "Producto eliminado",
      });
    } catch (error) {
      console.error('Error decreasing quantity:', error);
      toast({
        title: "Error",
        description: "No se pudo reducir la cantidad",
        variant: "destructive"
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return {
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
    loadSessionFromStorage,
    resumeSession,
    removeScannedItem,
    decreaseItemQuantity
  };
}
