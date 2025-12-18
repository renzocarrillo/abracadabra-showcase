import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle, RefreshCw, Search } from 'lucide-react';

interface StuckSale {
  venta_id: string;
  estado: string;
  id_bsale_documento: number;
  serial_number: string;
  created_at: string;
  has_reserved_stock: boolean;
  has_assignments: boolean;
}

export default function StuckSalesRecovery() {
  const [loading, setLoading] = useState(false);
  const [stuckSales, setStuckSales] = useState<StuckSale[]>([]);
  const [fixing, setFixing] = useState(false);

  const detectStuckSales = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fix-stuck-sales', {
        body: { autoFix: false }
      });

      if (error) throw error;

      setStuckSales(data.stuck_sales || []);
      toast.success(`Se encontraron ${data.count} ventas con problemas`);
    } catch (error: any) {
      toast.error(`Error al buscar ventas: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fixAllStuckSales = async () => {
    setFixing(true);
    try {
      const { data, error } = await supabase.functions.invoke('fix-stuck-sales', {
        body: { autoFix: true }
      });

      if (error) throw error;

      toast.success(
        `Corrección completada: ${data.summary.success} exitosas, ${data.summary.failed} fallidas`
      );
      
      // Refresh list after fixing
      await detectStuckSales();
    } catch (error: any) {
      toast.error(`Error al corregir ventas: ${error.message}`);
    } finally {
      setFixing(false);
    }
  };

  const fixSingleSale = async (saleId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('fix-stuck-sales', {
        body: { saleId, autoFix: true }
      });

      if (error) throw error;

      if (data.success) {
        toast.success(`Venta ${saleId} corregida exitosamente`);
        await detectStuckSales();
      } else {
        toast.error(`Error: ${data.error}`);
      }
    } catch (error: any) {
      toast.error(`Error al corregir venta: ${error.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Recuperación de Ventas Atascadas
        </h2>
        <p className="text-muted-foreground">
          Detecta y corrige ventas que quedaron en estado inconsistente
        </p>
      </div>

      <Card className="p-6 bg-card border-border">
        <div className="space-y-4">
          <div className="flex gap-4">
            <Button
              onClick={detectStuckSales}
              disabled={loading}
              className="flex items-center gap-2"
            >
              <Search className="h-4 w-4" />
              {loading ? 'Buscando...' : 'Detectar Ventas con Problemas'}
            </Button>

            {stuckSales.length > 0 && (
              <Button
                onClick={fixAllStuckSales}
                disabled={fixing}
                variant="destructive"
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                {fixing ? 'Corrigiendo...' : `Corregir Todas (${stuckSales.length})`}
              </Button>
            )}
          </div>

          {stuckSales.length === 0 && !loading && (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <p>No se encontraron ventas con problemas</p>
            </div>
          )}

          {stuckSales.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-orange-600">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-medium">
                  {stuckSales.length} ventas requieren corrección
                </span>
              </div>

              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full">
                  <thead>
                    <tr className="bg-table-header">
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        Venta
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        Serial Bsale
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        Estado
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        Problemas
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">
                        Acción
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {stuckSales.map((sale, index) => (
                      <tr
                        key={sale.venta_id}
                        className={`${
                          index % 2 === 0 ? 'bg-table-row' : 'bg-table-header'
                        } hover:bg-table-hover transition-colors`}
                      >
                        <td className="px-4 py-3 text-sm font-medium text-foreground">
                          {sale.venta_id}
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">
                          {sale.serial_number || 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className="px-2 py-1 rounded-full text-xs bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                            {sale.estado}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">
                          <div className="flex flex-col gap-1">
                            {sale.has_reserved_stock && (
                              <span className="text-xs text-orange-600">
                                • Stock reservado
                              </span>
                            )}
                            {sale.has_assignments && (
                              <span className="text-xs text-orange-600">
                                • Asignaciones activas
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            onClick={() => fixSingleSale(sale.venta_id)}
                            className="flex items-center gap-2"
                          >
                            <RefreshCw className="h-3 w-3" />
                            Corregir
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-6 bg-card border-border">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Información sobre Ventas Atascadas
        </h3>
        <div className="space-y-3 text-sm text-muted-foreground">
          <div>
            <strong className="text-foreground">¿Qué son ventas atascadas?</strong>
            <p className="mt-1">
              Son ventas que tienen documento emitido en Bsale pero no fueron archivadas
              correctamente en el sistema, dejando stock reservado y asignaciones activas.
            </p>
          </div>
          <div>
            <strong className="text-foreground">¿Qué hace la corrección?</strong>
            <ul className="mt-1 list-disc list-inside space-y-1">
              <li>Consume el stock reservado</li>
              <li>Elimina las asignaciones huérfanas</li>
              <li>Archiva la venta correctamente</li>
              <li>Registra la corrección en el log de auditoría</li>
            </ul>
          </div>
          <div>
            <strong className="text-foreground">¿Es seguro?</strong>
            <p className="mt-1">
              Sí. Solo corrige ventas que ya tienen documento emitido en Bsale.
              El stock se consume de forma controlada y se mantiene registro completo.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
