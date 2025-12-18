import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

export type PickingStatus = 'WAITING_FOR_BIN' | 'WAITING_FOR_PRODUCTS' | 'BIN_COMPLETED' | 'PICKING_COMPLETED_AWAITING_VERIFICATION' | 'VERIFICATION_MODE' | 'VERIFICATION_COMPLETED';

export interface ScannedItem {
  sku: string;
  binCode: string;
  scannedAt: string;
  quantity: number;
  productName: string;
}

export interface BinPickingData {
  binCode: string;
  items: BinPickingItem[];
  isCompleted: boolean;
  completedAt?: string;
  scannedItems: ScannedItem[];
}

export interface BinPickingItem {
  id: string;
  sku: string;
  nombre_producto: string;
  variante: string | null;
  cantidad: number;
  isScanned: boolean;
  scannedQuantity: number;
}

export interface ProductIssue {
  sku: string;
  productName: string;
  binCode: string;
  issueType: 'not_found' | 'insufficient' | 'relocated';
  expectedQuantity: number;
  foundQuantity: number;
  alternativeBins: Array<{ bin: string; quantity: number }>;
  resolved: boolean;
  detalleId?: string;
}

export interface VerificationItem {
  sku: string;
  nombre_producto: string;
  variante: string | null;
  totalQuantity: number;
  verifiedQuantity: number;
  isVerified: boolean;
}

export interface PickingSession {
  orderId: string;
  currentBinIndex: number;
  binsToProcess: BinPickingData[];
  status: PickingStatus;
  startedAt: string;
  completedAt?: string;
  issues: ProductIssue[];
  verificationItems: VerificationItem[];
  verificationStartedAt?: string;
  verificationCompletedAt?: string;
}

export function usePickingSession(orderId: string, initialBinItems: any[]) {
  const { toast } = useToast();
  const [session, setSession] = useState<PickingSession | null>(null);

  // Initialize session from bin items
  useEffect(() => {
    if (initialBinItems.length > 0 && !session) {
      initializeSession();
    }
  }, [initialBinItems]);

  const initializeSession = () => {
    // Group items by bin
    const binsMap = new Map<string, BinPickingItem[]>();
    
    initialBinItems.forEach(item => {
      const binCode = item.bin;
      if (!binsMap.has(binCode)) {
        binsMap.set(binCode, []);
      }
      
      binsMap.get(binCode)!.push({
        id: item.id,
        sku: item.sku,
        nombre_producto: item.nombre_producto,
        variante: item.variante,
        cantidad: item.cantidad,
        isScanned: false,
        scannedQuantity: 0
      });
    });

    // Create bins data
    const binsToProcess: BinPickingData[] = Array.from(binsMap.entries()).map(([binCode, items]) => ({
      binCode,
      items,
      isCompleted: false,
      scannedItems: []
    }));

    const newSession: PickingSession = {
      orderId,
      currentBinIndex: 0,
      binsToProcess,
      status: 'WAITING_FOR_BIN',
      startedAt: new Date().toISOString(),
      issues: [],
      verificationItems: []
    };

    setSession(newSession);
    saveSessionToStorage(newSession);
  };

  const saveSessionToStorage = (sessionData: PickingSession) => {
    localStorage.setItem(`picking_session_${orderId}`, JSON.stringify(sessionData));
  };

  const loadSessionFromStorage = () => {
    const saved = localStorage.getItem(`picking_session_${orderId}`);
    if (saved) {
      try {
        const sessionData = JSON.parse(saved);
        setSession(sessionData);
        return sessionData;
      } catch (error) {
        console.error('Error loading session from storage:', error);
      }
    }
    return null;
  };

  const scanBin = (scannedCode: string) => {
    if (!session) return false;

    const currentBin = session.binsToProcess[session.currentBinIndex];
    if (!currentBin) return false;

    if (scannedCode === currentBin.binCode) {
      const updatedSession = {
        ...session,
        status: 'WAITING_FOR_PRODUCTS' as PickingStatus
      };
      setSession(updatedSession);
      saveSessionToStorage(updatedSession);
      
      toast({
        title: "Bin correcto",
        description: `Bin ${currentBin.binCode} escaneado correctamente. Ahora escanee los productos.`,
      });
      
      return true;
    } else {
      toast({
        title: "Bin incorrecto",
        description: `Se esperaba el bin ${currentBin.binCode}, pero se escaneó ${scannedCode}`,
        variant: "destructive"
      });
      return false;
    }
  };

  const scanProduct = (scannedSku: string) => {
    if (!session) return false;

    const currentBin = session.binsToProcess[session.currentBinIndex];
    if (!currentBin) return false;

    // Find the product in current bin that still needs scanning
    const productIndex = currentBin.items.findIndex(item => 
      item.sku === scannedSku && item.scannedQuantity < item.cantidad
    );
    
    if (productIndex === -1) {
      // Check if product exists but is already fully scanned
      const fullyScanned = currentBin.items.find(item => 
        item.sku === scannedSku && item.scannedQuantity >= item.cantidad
      );
      if (fullyScanned) {
        toast({
          title: "Producto completamente escaneado",
          description: `El producto ${fullyScanned.nombre_producto} ya fue escaneado completamente (${fullyScanned.cantidad}/${fullyScanned.cantidad})`,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Producto no encontrado",
          description: `El SKU ${scannedSku} no se encuentra en el bin ${currentBin.binCode}`,
          variant: "destructive"
        });
      }
      return false;
    }

    // Increment scanned quantity
    const updatedSession = { ...session };
    const currentBinData = updatedSession.binsToProcess[session.currentBinIndex];
    
    currentBinData.items[productIndex].scannedQuantity += 1;
    
    // Mark as fully scanned if quantity is reached
    if (currentBinData.items[productIndex].scannedQuantity >= currentBinData.items[productIndex].cantidad) {
      currentBinData.items[productIndex].isScanned = true;
    }
    
    // Add to scanned items (one entry per scan)
    currentBinData.scannedItems.push({
      sku: scannedSku,
      binCode: currentBin.binCode,
      scannedAt: new Date().toISOString(),
      quantity: 1, // Each scan represents 1 unit
      productName: currentBinData.items[productIndex].nombre_producto
    });

    // Check if all products in bin are fully scanned
    const allScanned = currentBinData.items.every(item => item.isScanned);
    
    if (allScanned) {
      currentBinData.isCompleted = true;
      currentBinData.completedAt = new Date().toISOString();
      updatedSession.status = 'BIN_COMPLETED';
    }

    setSession(updatedSession);
    saveSessionToStorage(updatedSession);
    
    const item = currentBinData.items[productIndex];
    toast({
      title: "Producto escaneado",
      description: `${item.nombre_producto} - ${item.scannedQuantity}/${item.cantidad} escaneados`,
    });
    
    return true;
  };

  const moveToNextBin = () => {
    if (!session) return;

    const nextIndex = session.currentBinIndex + 1;
    
    if (nextIndex >= session.binsToProcess.length) {
      // All bins completed - now waiting for verification
      const updatedSession = {
        ...session,
        status: 'PICKING_COMPLETED_AWAITING_VERIFICATION' as PickingStatus
      };
      setSession(updatedSession);
      saveSessionToStorage(updatedSession);
      
      toast({
        title: "Picking completado",
        description: "Ahora debe verificar todos los productos escaneados",
      });
    } else {
      // Move to next bin
      const updatedSession = {
        ...session,
        currentBinIndex: nextIndex,
        status: 'WAITING_FOR_BIN' as PickingStatus
      };
      setSession(updatedSession);
      saveSessionToStorage(updatedSession);
    }
  };

  const resetSession = () => {
    localStorage.removeItem(`picking_session_${orderId}`);
    setSession(null);
  };

  const getCurrentBin = () => {
    if (!session || session.currentBinIndex >= session.binsToProcess.length) {
      return null;
    }
    return session.binsToProcess[session.currentBinIndex];
  };

  const getProgress = () => {
    if (!session) return { completed: 0, total: 0, percentage: 0 };
    
    const completed = session.binsToProcess.filter(bin => bin.isCompleted).length;
    const total = session.binsToProcess.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    return { completed, total, percentage };
  };

  const getAllScannedItems = () => {
    if (!session) return [];
    
    return session.binsToProcess.flatMap(bin => bin.scannedItems);
  };

  // Reportar problema con producto
  const reportProductIssue = (
    sku: string,
    productName: string,
    binCode: string,
    issueType: 'not_found' | 'insufficient' | 'relocated',
    expectedQuantity: number,
    foundQuantity: number,
    detalleId?: string
  ) => {
    setSession((prev) => {
      if (!prev) return prev;
      
      const newIssue: ProductIssue = {
        sku,
        productName,
        binCode,
        issueType,
        expectedQuantity,
        foundQuantity,
        alternativeBins: [],
        resolved: false,
        detalleId,
      };

      const updatedSession = {
        ...prev,
        issues: [...prev.issues, newIssue],
      };
      
      saveSessionToStorage(updatedSession);
      return updatedSession;
    });
  };

  // Marcar issue como resuelto
  const resolveIssue = (sku: string, binCode: string, alternativeBins: Array<{ bin: string; quantity: number }>) => {
    setSession((prev) => {
      if (!prev) return prev;
      
      const updatedSession = {
        ...prev,
        issues: prev.issues.map((issue) =>
          issue.sku === sku && issue.binCode === binCode
            ? { ...issue, resolved: true, alternativeBins }
            : issue
        ),
      };
      
      saveSessionToStorage(updatedSession);
      return updatedSession;
    });
  };

  // Iniciar modo verificación
  const startVerification = () => {
    if (!session) return;

    // Consolidar todos los productos escaneados por SKU
    const verificationMap = new Map<string, VerificationItem>();

    session.binsToProcess.forEach(bin => {
      bin.items.forEach(item => {
        const existing = verificationMap.get(item.sku);
        if (existing) {
          existing.totalQuantity += item.cantidad;
        } else {
          verificationMap.set(item.sku, {
            sku: item.sku,
            nombre_producto: item.nombre_producto,
            variante: item.variante,
            totalQuantity: item.cantidad,
            verifiedQuantity: 0,
            isVerified: false
          });
        }
      });
    });

    const updatedSession = {
      ...session,
      status: 'VERIFICATION_MODE' as PickingStatus,
      verificationItems: Array.from(verificationMap.values()),
      verificationStartedAt: new Date().toISOString()
    };

    setSession(updatedSession);
    saveSessionToStorage(updatedSession);

    toast({
      title: "Modo verificación iniciado",
      description: "Escanee todos los productos para verificar",
    });
  };

  // Escanear producto en modo verificación
  const scanProductForVerification = (scannedSku: string) => {
    if (!session || session.status !== 'VERIFICATION_MODE') return false;

    const itemIndex = session.verificationItems.findIndex(
      item => item.sku === scannedSku && item.verifiedQuantity < item.totalQuantity
    );

    if (itemIndex === -1) {
      const fullyVerified = session.verificationItems.find(
        item => item.sku === scannedSku && item.verifiedQuantity >= item.totalQuantity
      );
      
      if (fullyVerified) {
        toast({
          title: "Producto completamente verificado",
          description: `${fullyVerified.nombre_producto} ya fue verificado completamente`,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Producto no encontrado",
          description: `El SKU ${scannedSku} no está en la lista de verificación`,
          variant: "destructive"
        });
      }
      return false;
    }

    const updatedSession = { ...session };
    updatedSession.verificationItems[itemIndex].verifiedQuantity += 1;

    if (updatedSession.verificationItems[itemIndex].verifiedQuantity >= 
        updatedSession.verificationItems[itemIndex].totalQuantity) {
      updatedSession.verificationItems[itemIndex].isVerified = true;
    }

    // Verificar si todos los productos están verificados
    const allVerified = updatedSession.verificationItems.every(item => item.isVerified);

    if (allVerified) {
      updatedSession.status = 'VERIFICATION_COMPLETED';
      updatedSession.verificationCompletedAt = new Date().toISOString();
      updatedSession.completedAt = new Date().toISOString();
      
      toast({
        title: "Verificación completada",
        description: "Todos los productos han sido verificados correctamente",
      });
    } else {
      const item = updatedSession.verificationItems[itemIndex];
      toast({
        title: "Producto verificado",
        description: `${item.nombre_producto} - ${item.verifiedQuantity}/${item.totalQuantity} verificados`,
      });
    }

    setSession(updatedSession);
    saveSessionToStorage(updatedSession);
    return true;
  };

  return {
    session,
    initializeSession,
    scanBin,
    scanProduct,
    moveToNextBin,
    resetSession,
    getCurrentBin,
    getProgress,
    getAllScannedItems,
    loadSessionFromStorage,
    reportProductIssue,
    resolveIssue,
    startVerification,
    scanProductForVerification,
  };
}