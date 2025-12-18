import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Layout from '@/components/Layout';

interface ReconciliationRecord {
  sku: string;
  nombre_producto: string;
  variante: string | null;
  abracadabra_stock: number;
  bsale_stock: number;
  difference: number;
  status: 'match' | 'discrepancy';
}

export default function StockReconciliation() {
  const { profile } = useAuth();
  const { hasPermission, userType, isAdmin } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [reconciliationData, setReconciliationData] = useState<ReconciliationRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Check if user has permission
  const hasAccess = isAdmin() || userType?.name === 'supervisor' || hasPermission('view_reconciliation');

  useEffect(() => {
    if (!hasAccess) {
      setError('No tienes permisos para acceder a esta sección');
      setLoading(false);
      return;
    }

    fetchReconciliationData();
  }, [hasAccess]);

  // Helper to normalize SKU (handles different dash types)
  const normalizeSku = (sku: string): string => {
    return sku.replace(/[–—]/g, '-').trim().toUpperCase();
  };

  const fetchReconciliationData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch stockxbin aggregated by SKU
      const { data: abracadabraData, error: abracadabraError } = await supabase
        .from('stockxbin')
        .select('sku, disponibles, comprometido, reservado')
        .not('sku', 'is', null);

      if (abracadabraError) throw abracadabraError;

      // Fetch stocks_tiendas_bsale
      const { data: bsaleData, error: bsaleError } = await supabase
        .from('stocks_tiendas_bsale')
        .select('sku, almCentral')
        .not('sku', 'is', null);

      if (bsaleError) throw bsaleError;

      // Aggregate Abracadabra stock by SKU (normalized)
      const abracadabraMap = new Map<string, number>();
      abracadabraData?.forEach(item => {
        if (item.sku) {
          const normalizedSku = normalizeSku(item.sku);
          const currentTotal = abracadabraMap.get(normalizedSku) || 0;
          const itemTotal = (item.disponibles || 0) + (item.comprometido || 0) + (item.reservado || 0);
          abracadabraMap.set(normalizedSku, currentTotal + itemTotal);
        }
      });

      // Create BSale map (normalized)
      const bsaleMap = new Map<string, number>();
      bsaleData?.forEach(item => {
        if (item.sku) {
          const normalizedSku = normalizeSku(item.sku);
          bsaleMap.set(normalizedSku, item.almCentral || 0);
        }
      });

      // Get all unique SKUs
      const allSkus = new Set([...abracadabraMap.keys(), ...bsaleMap.keys()]);

      // First, calculate discrepancies without names
      const discrepancySkus: string[] = [];
      const reconciliation: ReconciliationRecord[] = [];
      
      allSkus.forEach(sku => {
        const abracadabraStock = abracadabraMap.get(sku) || 0;
        const bsaleStock = bsaleMap.get(sku) || 0;
        const difference = abracadabraStock - bsaleStock;
        
        // Only include if there's a discrepancy
        if (difference !== 0) {
          discrepancySkus.push(sku);
          reconciliation.push({
            sku,
            nombre_producto: 'Cargando...', // Placeholder
            variante: null,
            abracadabra_stock: abracadabraStock,
            bsale_stock: bsaleStock,
            difference,
            status: 'discrepancy'
          });
        }
      });

      // Now fetch variant details ONLY for discrepancy SKUs, in chunks
      const variantsMap = new Map<string, { nombreProducto: string; variante: string | null }>();
      const CHUNK_SIZE = 200;
      
      for (let i = 0; i < discrepancySkus.length; i += CHUNK_SIZE) {
        const chunk = discrepancySkus.slice(i, i + CHUNK_SIZE);
        
        try {
          const { data: variantsData, error: variantsError } = await supabase
            .from('variants')
            .select('sku, "nombreProducto", variante')
            .in('sku', chunk);

          if (variantsError) {
            console.error('Error fetching variants chunk:', variantsError);
            continue;
          }

          // Add to map with normalized SKU
          variantsData?.forEach(v => {
            if (v.sku) {
              const normalizedSku = normalizeSku(v.sku);
              variantsMap.set(normalizedSku, { 
                nombreProducto: v.nombreProducto, 
                variante: v.variante 
              });
            }
          });
        } catch (chunkError) {
          console.error('Error processing variants chunk:', chunkError);
        }
      }

      // Map variant data back to reconciliation records
      reconciliation.forEach(record => {
        const variant = variantsMap.get(record.sku);
        if (variant) {
          record.nombre_producto = variant.nombreProducto;
          record.variante = variant.variante;
        } else {
          record.nombre_producto = 'Producto desconocido';
        }
      });

      // Sort by absolute difference (largest discrepancies first)
      reconciliation.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));

      setReconciliationData(reconciliation);
    } catch (err) {
      console.error('Error fetching reconciliation data:', err);
      setError('Error al cargar los datos de conciliación');
    } finally {
      setLoading(false);
    }
  };

  if (!hasAccess) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Acceso Denegado</AlertTitle>
        <AlertDescription>
          No tienes permisos para acceder a esta sección. Solo administradores y supervisores pueden ver las conciliaciones.
        </AlertDescription>
      </Alert>
    );
  }

  const matchCount = reconciliationData.filter(r => r.status === 'match').length;
  const discrepancyCount = reconciliationData.filter(r => r.status === 'discrepancy').length;

  return (
    <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Conciliación de Stocks</h1>
          <p className="text-muted-foreground">
            Comparación entre los stocks de Abracadabra y BSale
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Discrepancias
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{discrepancyCount}</div>
              <p className="text-xs text-muted-foreground">
                Productos con diferencias
              </p>
            </CardContent>
          </Card>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Productos con Discrepancias</CardTitle>
            <CardDescription>
              Solo se muestran productos donde hay diferencias entre Abracadabra y BSale
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : reconciliationData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 className="h-12 w-12 text-success mb-4" />
                <p className="text-lg font-medium">¡Excelente!</p>
                <p className="text-muted-foreground">
                  No hay discrepancias entre Abracadabra y BSale
                </p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead>Variante</TableHead>
                      <TableHead className="text-right">Abracadabra</TableHead>
                      <TableHead className="text-right">BSale</TableHead>
                      <TableHead className="text-right">Diferencia</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reconciliationData.map((record) => (
                      <TableRow key={record.sku}>
                        <TableCell className="font-mono text-sm">
                          {record.sku}
                        </TableCell>
                        <TableCell>{record.nombre_producto}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {record.variante || '-'}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {record.abracadabra_stock}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {record.bsale_stock}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={
                            record.difference > 0 
                              ? 'text-blue-600 font-medium' 
                              : 'text-destructive font-medium'
                          }>
                            {record.difference > 0 ? '+' : ''}{record.difference}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={record.status === 'match' ? 'default' : 'destructive'}
                          >
                            {record.status === 'match' ? 'Coincide' : 'Discrepancia'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
  );
}
