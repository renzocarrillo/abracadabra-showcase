import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { ErrorOverlay } from '@/components/ErrorOverlay';
import { SuccessOverlay } from '@/components/SuccessOverlay';
import { CheckCircle2, Circle, PackageCheck, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { audioService } from '@/lib/audioService';

type VerificationState = 'SCAN_TRANSFER' | 'VERIFYING_PRODUCTS' | 'COMPLETED';

interface TransferSession {
  id: string;
  created_at: string;
  created_by_name: string;
  tienda_destino_nombre?: string;
  total_items: number;
  unique_products: number;
}

interface TransferItem {
  sku: string;
  nombre_producto: string;
  variante: string | null;
  quantity: number;
}

interface VerificationItem extends TransferItem {
  verifiedQuantity: number;
  isVerified: boolean;
}

export default function VerifyTransferReception() {
  const navigate = useNavigate();
  const [state, setState] = useState<VerificationState>('SCAN_TRANSFER');
  const [session, setSession] = useState<TransferSession | null>(null);
  const [verificationItems, setVerificationItems] = useState<VerificationItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const playSuccessBeep = () => {
    audioService.playSuccessBeep();
  };

  const handleTransferScan = async (code: string) => {
    if (loading) return;
    
    setLoading(true);
    setError(null);

    try {
      const codeUpper = code.toUpperCase();
      
      // Check if it's a picking libre session (PL-XXXXX) or a pedido (PED-YYYYMMDD-XXXX)
      if (codeUpper.startsWith('PL-')) {
        // Handle Picking Libre Session
        const sessionPrefix = code.replace(/^PL-/i, '').toLowerCase();

        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

        const { data: sessions, error: searchError } = await supabase
          .from('picking_libre_sessions')
          .select('id, created_at, created_by_name, total_items, unique_products, tienda_destino_id')
          .eq('status', 'completado')
          .gte('created_at', tenDaysAgo.toISOString())
          .order('created_at', { ascending: false })
          .limit(500);

        if (searchError) throw searchError;

        const foundSession = sessions?.find(
          s => s.id.toLowerCase().startsWith(sessionPrefix)
        );

        if (!foundSession) {
          setError('No se encontró una transferencia completada con ese código (últimos 10 días)');
          return;
        }

        let tiendaDestinoNombre: string | undefined;
        if (foundSession.tienda_destino_id) {
          const { data: tienda } = await supabase
            .from('tiendas')
            .select('nombre')
            .eq('id', foundSession.tienda_destino_id)
            .single();
          tiendaDestinoNombre = tienda?.nombre;
        }

        const { data: items, error: itemsError } = await supabase
          .from('picking_libre_items')
          .select('sku, nombre_producto, variante, quantity')
          .eq('session_id', foundSession.id);

        if (itemsError) throw itemsError;

        if (!items || items.length === 0) {
          setError('Esta transferencia no tiene productos registrados');
          return;
        }

        const itemsMap = new Map<string, TransferItem>();
        items.forEach(item => {
          const existing = itemsMap.get(item.sku);
          if (existing) {
            existing.quantity += item.quantity;
          } else {
            itemsMap.set(item.sku, { ...item });
          }
        });

        const verificationList: VerificationItem[] = Array.from(itemsMap.values()).map(item => ({
          ...item,
          verifiedQuantity: 0,
          isVerified: false
        }));

        setSession({
          id: foundSession.id,
          created_at: foundSession.created_at,
          created_by_name: foundSession.created_by_name,
          tienda_destino_nombre: tiendaDestinoNombre,
          total_items: foundSession.total_items || 0,
          unique_products: foundSession.unique_products || 0
        });
        setVerificationItems(verificationList);
        setState('VERIFYING_PRODUCTS');
        playSuccessBeep();

      } else if (codeUpper.startsWith('PED-')) {
        // Handle Pedido (Traslado entre sucursales)
        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

        const { data: pedido, error: pedidoError } = await supabase
          .from('pedidos')
          .select('id, pedido_id, created_at, tienda_nombre, total_items, estado')
          .eq('pedido_id', code)
          .eq('estado', 'archivado')
          .gte('created_at', tenDaysAgo.toISOString())
          .single();

        if (pedidoError || !pedido) {
          setError('No se encontró un pedido archivado con ese código (últimos 10 días)');
          return;
        }

        // Load pedido details with assignments
        const { data: detalles, error: detallesError } = await supabase
          .from('pedidos_detalle')
          .select('sku, nombre_producto, variante, cantidad_asignada')
          .eq('pedido_id', pedido.id);

        if (detallesError) throw detallesError;

        if (!detalles || detalles.length === 0) {
          setError('Este pedido no tiene productos registrados');
          return;
        }

        // Group items by SKU (sum quantities)
        const itemsMap = new Map<string, TransferItem>();
        detalles.forEach(detalle => {
          const existing = itemsMap.get(detalle.sku);
          if (existing) {
            existing.quantity += detalle.cantidad_asignada;
          } else {
            itemsMap.set(detalle.sku, {
              sku: detalle.sku,
              nombre_producto: detalle.nombre_producto,
              variante: detalle.variante,
              quantity: detalle.cantidad_asignada
            });
          }
        });

        const verificationList: VerificationItem[] = Array.from(itemsMap.values()).map(item => ({
          ...item,
          verifiedQuantity: 0,
          isVerified: false
        }));

        setSession({
          id: pedido.id,
          created_at: pedido.created_at,
          created_by_name: 'Sistema', // Pedidos don't track created_by_name
          tienda_destino_nombre: pedido.tienda_nombre || undefined,
          total_items: pedido.total_items || 0,
          unique_products: verificationList.length
        });
        setVerificationItems(verificationList);
        setState('VERIFYING_PRODUCTS');
        playSuccessBeep();

      } else {
        setError('Código inválido. Debe escanear un código PL-XXXXX (picking libre) o PED-YYYYMMDD-XXXX (pedido)');
        return;
      }
    } catch (err) {
      console.error('Error loading transfer:', err);
      setError('Error al cargar la transferencia o pedido');
    } finally {
      setLoading(false);
    }
  };

  const handleProductScan = (code: string) => {
    if (loading) return;

    const normalizedSku = code.trim().toUpperCase();

    // Find item with this SKU
    const itemIndex = verificationItems.findIndex(
      item => item.sku.toUpperCase() === normalizedSku
    );

    if (itemIndex === -1) {
      setError(`Producto ${code} no pertenece a esta transferencia`);
      return;
    }

    const item = verificationItems[itemIndex];

    // Check if already fully verified
    if (item.verifiedQuantity >= item.quantity) {
      setError(`Ya verificaste todas las unidades de ${item.nombre_producto}`);
      return;
    }

    // Increment verified quantity
    const updatedItems = [...verificationItems];
    updatedItems[itemIndex] = {
      ...item,
      verifiedQuantity: item.verifiedQuantity + 1,
      isVerified: item.verifiedQuantity + 1 >= item.quantity
    };
    setVerificationItems(updatedItems);
    playSuccessBeep();

    // Check if all verified
    const allVerified = updatedItems.every(i => i.isVerified);
    if (allVerified) {
      setState('COMPLETED');
      setSuccess('¡Verificación completada! Todos los productos fueron escaneados correctamente.');
    }
  };

  const handleReset = () => {
    setState('SCAN_TRANSFER');
    setSession(null);
    setVerificationItems([]);
    setError(null);
    setSuccess(null);
  };

  const totalProducts = verificationItems.length;
  const verifiedProducts = verificationItems.filter(item => item.isVerified).length;
  const totalUnits = verificationItems.reduce((sum, item) => sum + item.quantity, 0);
  const verifiedUnits = verificationItems.reduce((sum, item) => sum + item.verifiedQuantity, 0);
  const progress = totalUnits > 0 ? (verifiedUnits / totalUnits) * 100 : 0;

  return (
    <div className="container mx-auto p-4 max-w-4xl space-y-4">
      {error && (
        <ErrorOverlay
          message={error}
          onClose={() => setError(null)}
        />
      )}

      {success && (
        <SuccessOverlay
          message={success}
          onClose={() => setSuccess(null)}
        />
      )}

      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/dashboard')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <PackageCheck className="h-6 w-6" />
          Verificar Recepción
        </h1>
      </div>

      {state === 'SCAN_TRANSFER' && (
        <Card>
          <CardHeader>
            <CardTitle>Escanear Código de Transferencia o Pedido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Escanea el código de la etiqueta de transferencia (PL-XXXXX) o pedido (PED-YYYYMMDD-XXXX) para comenzar la verificación.
            </p>
            <BarcodeScanner
              onScan={handleTransferScan}
              placeholder="Escanear código PL-XXXXX o PED-YYYYMMDD-XXXX..."
              disabled={loading}
            />
          </CardContent>
        </Card>
      )}

      {state === 'VERIFYING_PRODUCTS' && session && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Información de la Transferencia</span>
                <Badge variant="outline" className="text-lg px-3 py-1">
                  {session.id.slice(0, 8).toUpperCase()}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                {session.tienda_destino_nombre && (
                  <div>
                    <span className="text-muted-foreground">Destino:</span>
                    <p className="font-semibold">{session.tienda_destino_nombre}</p>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Creado por:</span>
                  <p className="font-semibold">{session.created_by_name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Fecha:</span>
                  <p className="font-semibold">
                    {format(new Date(session.created_at), 'dd/MM/yyyy HH:mm')}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Total unidades:</span>
                  <p className="font-semibold">{session.total_items}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Verificación de Productos</span>
                <Badge variant="outline">
                  {verifiedProducts}/{totalProducts} productos
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progreso total</span>
                  <span className="font-medium">
                    {verifiedUnits}/{totalUnits} unidades ({Math.round(progress)}%)
                  </span>
                </div>
                <Progress value={progress} className="h-3" />
              </div>

              <BarcodeScanner
                onScan={handleProductScan}
                placeholder="Escanear SKU del producto..."
                disabled={loading}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Lista de Productos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {verificationItems.map((item) => (
                  <div
                    key={item.sku}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                      item.isVerified 
                        ? 'bg-success/10 border-success/30' 
                        : 'bg-card border-border'
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {item.isVerified ? (
                        <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.nombre_producto}</p>
                        {item.variante && (
                          <p className="text-xs text-muted-foreground truncate">{item.variante}</p>
                        )}
                        <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>
                      </div>
                    </div>
                    <Badge 
                      variant={item.isVerified ? "default" : "secondary"}
                      className="ml-2 flex-shrink-0"
                    >
                      {item.verifiedQuantity}/{item.quantity}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {state === 'COMPLETED' && (
        <Card>
          <CardContent className="pt-6 text-center space-y-4">
            <CheckCircle2 className="h-16 w-16 text-success mx-auto" />
            <h2 className="text-2xl font-bold">¡Verificación Completada!</h2>
            <p className="text-muted-foreground">
              Todos los productos de la transferencia fueron verificados correctamente.
            </p>
            <div className="flex gap-4 justify-center pt-4">
              <Button onClick={handleReset}>
                Verificar Otra Transferencia
              </Button>
              <Button variant="outline" onClick={() => navigate('/dashboard')}>
                Volver al Inicio
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
