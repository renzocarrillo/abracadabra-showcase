import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Search, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function DiagnosticoAsignaciones() {
  const [ventaCode, setVentaCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [ventaInfo, setVentaInfo] = useState<any>(null);
  const [currentAssignments, setCurrentAssignments] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);

  const investigateVenta = async () => {
    if (!ventaCode.trim()) {
      toast.error('Ingresa un código de venta');
      return;
    }

    setLoading(true);
    try {
      // 1. Obtener información de la venta
      const { data: venta, error: ventaError } = await supabase
        .from('ventas')
        .select('*')
        .eq('venta_id', ventaCode)
        .single();

      if (ventaError) throw ventaError;
      setVentaInfo(venta);

      // 2. Obtener historial de asignaciones
      const { data: historyData, error: historyError } = await supabase
        .rpc('get_assignment_history', { venta_codigo_param: ventaCode });

      if (!historyError) {
        setHistory(historyData || []);
      }

      // 3. Obtener asignaciones actuales (si existen)
      const { data: assignments } = await supabase
        .from('ventas_asignaciones')
        .select('*, stockxbin(disponibles, comprometido, en_existencia)')
        .eq('venta_id', venta.id);

      setCurrentAssignments(assignments || []);

      // 4. Obtener audit log de la venta
      const { data: audit } = await supabase
        .from('ventas_audit_log')
        .select('*')
        .eq('venta_codigo', ventaCode)
        .order('created_at', { ascending: true });

      setAuditLog(audit || []);

      toast.success('Investigación completada');
    } catch (error: any) {
      console.error('Error:', error);
      toast.error(error.message || 'Error al investigar venta');
    } finally {
      setLoading(false);
    }
  };

  const getOperationBadge = (operation: string) => {
    if (operation === 'INSERT') return <Badge className="bg-green-500">Creada</Badge>;
    if (operation === 'DELETE') return <Badge variant="destructive">Eliminada</Badge>;
    if (operation === 'UPDATE') return <Badge variant="secondary">Modificada</Badge>;
    return <Badge>{operation}</Badge>;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Diagnóstico de Asignaciones de Stock</h1>
        <p className="text-muted-foreground">
          Herramienta forense para investigar por qué el stock no se restó en una venta
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Buscar Venta</CardTitle>
          <CardDescription>Ingresa el código de venta (ej: V1128) para investigar</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Código de venta (V1128)"
              value={ventaCode}
              onChange={(e) => setVentaCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && investigateVenta()}
            />
            <Button onClick={investigateVenta} disabled={loading}>
              <Search className="mr-2 h-4 w-4" />
              {loading ? 'Investigando...' : 'Investigar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {ventaInfo && (
        <>
          {/* Información de la Venta */}
          <Card>
            <CardHeader>
              <CardTitle>Información de la Venta {ventaInfo.venta_id}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="font-semibold">Estado:</span> {ventaInfo.estado}
                </div>
                <div>
                  <span className="font-semibold">Tipo Documento:</span> {ventaInfo.documento_tipo}
                </div>
                <div>
                  <span className="font-semibold">Requiere Guía:</span> {ventaInfo.requiere_guia_remision ? 'Sí' : 'No'}
                </div>
                <div>
                  <span className="font-semibold">Guía Emitida:</span> {ventaInfo.guia_remision ? 'Sí' : 'No'}
                </div>
                <div>
                  <span className="font-semibold">Creada:</span> {new Date(ventaInfo.created_at).toLocaleString()}
                </div>
                <div>
                  <span className="font-semibold">Actualizada:</span> {new Date(ventaInfo.updated_at).toLocaleString()}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Asignaciones Actuales */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Asignaciones Actuales
                {currentAssignments.length > 0 ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
              </CardTitle>
              <CardDescription>
                {currentAssignments.length > 0
                  ? `${currentAssignments.length} asignaciones activas`
                  : 'No hay asignaciones activas (fueron eliminadas)'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {currentAssignments.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Bin</TableHead>
                      <TableHead>Asignado</TableHead>
                      <TableHead>Disponible</TableHead>
                      <TableHead>Comprometido</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentAssignments.map((asig) => (
                      <TableRow key={asig.id}>
                        <TableCell>{asig.sku}</TableCell>
                        <TableCell>{asig.bin}</TableCell>
                        <TableCell>{asig.cantidad_asignada}</TableCell>
                        <TableCell>{asig.stockxbin?.disponibles ?? 'N/A'}</TableCell>
                        <TableCell>{asig.stockxbin?.comprometido ?? 'N/A'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No existen asignaciones activas. Si esta venta requería consumo de stock, 
                    las asignaciones fueron eliminadas prematuramente.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Historial de Asignaciones */}
          <Card>
            <CardHeader>
              <CardTitle>Historial Completo de Asignaciones</CardTitle>
              <CardDescription>
                Rastreo completo del ciclo de vida de las asignaciones
              </CardDescription>
            </CardHeader>
            <CardContent>
              {history.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha/Hora</TableHead>
                      <TableHead>Operación</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Bin</TableHead>
                      <TableHead>Cantidad</TableHead>
                      <TableHead>Usuario</TableHead>
                      <TableHead>Función</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((h, idx) => (
                      <TableRow key={idx} className={h.operation === 'DELETE' ? 'bg-red-50 dark:bg-red-950' : ''}>
                        <TableCell className="text-xs">
                          {new Date(h.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell>{getOperationBadge(h.operation)}</TableCell>
                        <TableCell className="font-mono">{h.sku}</TableCell>
                        <TableCell>{h.bin}</TableCell>
                        <TableCell>{h.cantidad}</TableCell>
                        <TableCell className="text-xs">{h.user_email || 'Sistema'}</TableCell>
                        <TableCell className="text-xs">{h.function_name || 'N/A'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Alert>
                  <AlertDescription>
                    No hay historial de asignaciones registrado. Esta funcionalidad se activó recientemente.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Audit Log de la Venta */}
          <Card>
            <CardHeader>
              <CardTitle>Audit Log Completo</CardTitle>
              <CardDescription>Todas las operaciones realizadas en esta venta</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha/Hora</TableHead>
                    <TableHead>Acción</TableHead>
                    <TableHead>Estado Anterior</TableHead>
                    <TableHead>Estado Nuevo</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Detalles</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLog.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs">
                        {new Date(log.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={log.accion === 'consumo_stock' ? 'default' : 'secondary'}>
                          {log.accion}
                        </Badge>
                      </TableCell>
                      <TableCell>{log.estado_anterior || '-'}</TableCell>
                      <TableCell>{log.estado_nuevo || '-'}</TableCell>
                      <TableCell className="text-xs">{log.usuario_nombre || 'Sistema'}</TableCell>
                      <TableCell className="text-xs max-w-xs truncate">
                        {log.detalles ? JSON.stringify(log.detalles) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Análisis y Diagnóstico */}
          <Card>
            <CardHeader>
              <CardTitle>Diagnóstico</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">¿Qué pasó con el stock?</h3>
                {!auditLog.find(a => a.accion === 'consumo_stock') && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>PROBLEMA DETECTADO:</strong> No hay registro de consumo de stock en el audit log.
                      Esto indica que la función consume_stock_strict() nunca se ejecutó exitosamente.
                    </AlertDescription>
                  </Alert>
                )}
                
                {history.find(h => h.operation === 'DELETE') && !auditLog.find(a => a.accion === 'consumo_stock') && (
                  <Alert variant="destructive" className="mt-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>CAUSA RAÍZ:</strong> Las asignaciones fueron eliminadas ANTES de consumir el stock.
                      Cuando se intentó emitir la guía, ya no había asignaciones disponibles para consumir.
                    </AlertDescription>
                  </Alert>
                )}

                {auditLog.find(a => a.accion === 'stock_kept_committed') && (
                  <Alert className="mt-2">
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Stock Comprometido:</strong> El stock fue correctamente comprometido después de emitir el documento.
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <div>
                <h3 className="font-semibold mb-2">Recomendaciones</h3>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Si el stock no se restó: Usa la función manual-complete-sale para corregirlo</li>
                  <li>Verifica que no haya triggers que eliminen asignaciones prematuramente</li>
                  <li>Revisa los logs de Postgres para ver warnings del trigger auto_cleanup</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
