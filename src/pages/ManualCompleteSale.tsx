import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ManualCompleteSale() {
  const [saleCode, setSaleCode] = useState("V1073");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleComplete = async () => {
    if (!saleCode.trim()) {
      toast.error("Ingresa un código de venta");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('manual-complete-sale', {
        body: { saleCode: saleCode.trim() }
      });

      if (error) throw error;

      if (data.success) {
        setResult(data);
        toast.success(data.message);
      } else {
        throw new Error(data.error || 'Error procesando la venta');
      }
    } catch (error: any) {
      console.error('Error completing sale:', error);
      toast.error(error.message || 'Error al completar la venta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>Completar Venta Manualmente</CardTitle>
          <CardDescription>
            Marca una venta como preparada y descuenta el stock de Abracadabra sin hacer POST a BSale.
            Útil cuando la venta ya fue emitida directamente desde BSale.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>ADVERTENCIA:</strong> Esta acción descuenta stock de Abracadabra usando estrategia FIFO (primeros bins disponibles).
              No realiza ningún POST a BSale. Usar solo para ventas ya emitidas desde BSale.
            </AlertDescription>
          </Alert>

          <div className="flex gap-2">
            <Input
              placeholder="Código de venta (ej: V1073)"
              value={saleCode}
              onChange={(e) => setSaleCode(e.target.value)}
              disabled={loading}
            />
            <Button onClick={handleComplete} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Procesando...
                </>
              ) : (
                'Completar Venta'
              )}
            </Button>
          </div>

          {result && (
            <Card className="border-green-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-5 w-5" />
                  Proceso Completado
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{result.message}</p>
                
                <div className="space-y-2">
                  <h4 className="font-semibold">Items Procesados:</h4>
                  {result.processedItems.map((item: any, idx: number) => (
                    <div key={idx} className="p-3 bg-muted rounded-md space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm">{item.sku}</span>
                        <span className={`text-sm font-semibold ${
                          item.status === 'complete' ? 'text-green-600' :
                          item.status === 'partial' ? 'text-yellow-600' :
                          'text-red-600'
                        }`}>
                          {item.consumed}/{item.requested} unidades
                        </span>
                      </div>
                      {item.bins && item.bins.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          Bins: {item.bins.map((b: any) => `${b.bin} (${b.quantity})`).join(', ')}
                        </div>
                      )}
                      {item.status !== 'complete' && (
                        <div className="text-xs text-yellow-600">
                          ⚠️ {item.status === 'insufficient_stock' ? 'Sin stock disponible' : 'Stock insuficiente'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
