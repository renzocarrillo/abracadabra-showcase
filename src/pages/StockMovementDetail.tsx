import React from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, ArrowUpCircle, ArrowDownCircle, Package, MapPin, Hash, Calendar, User, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { usePermissions } from '@/hooks/usePermissions';

interface MovementDetail {
  id: string;
  sku: string;
  quantity: number;
  bin_code: string;
  nombre_producto: string;
  variante: string | null;
  unit_cost?: number;
}

interface MovementInfo {
  type: 'Ingreso' | 'Retiro';
  document_number: number;
  created_at: string;
  created_by_name: string | null;
  internal_identifier: string | null;
  note: string | null;
  total_items: number;
}

export default function StockMovementDetail() {
  const { movementId } = useParams<{ movementId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const movementType = searchParams.get('type') as 'Ingreso' | 'Retiro';
  const { isAdmin, userType, loading: permissionsLoading } = usePermissions();

  const canViewLogs = isAdmin() || userType?.name === 'supervisor';

  // Fetch movement info
  const { data: movementInfo, isLoading: isLoadingInfo } = useQuery({
    queryKey: ['movement-info', movementId, movementType],
    queryFn: async () => {
      const table = movementType === 'Ingreso' ? 'stock_receptions' : 'stock_consumptions';
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('id', movementId)
        .single();

      if (error) throw error;

      return {
        ...data,
        type: movementType,
      } as MovementInfo;
    },
    enabled: !!movementId && !!movementType,
  });

  // Fetch movement details
  const { data: details = [], isLoading: isLoadingDetails } = useQuery({
    queryKey: ['movement-details', movementId, movementType],
    queryFn: async () => {
      const table = movementType === 'Ingreso' 
        ? 'stock_reception_details' 
        : 'stock_consumption_details';
      
      // Use any to bypass TypeScript limitations with new tables
      const { data, error } = await (supabase as any)
        .from(table)
        .select('*')
        .eq(movementType === 'Ingreso' ? 'reception_id' : 'consumption_id', movementId)
        .order('nombre_producto', { ascending: true });

      if (error) throw error;
      return (data || []) as MovementDetail[];
    },
    enabled: !!movementId && !!movementType,
  });

  if (permissionsLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card className="p-12">
          <div className="flex items-center justify-center">
            <p className="text-muted-foreground">Verificando permisos...</p>
          </div>
        </Card>
      </div>
    );
  }

  if (!canViewLogs) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No tienes permisos para acceder a esta página.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const isLoading = isLoadingInfo || isLoadingDetails;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => navigate('/productos/logs')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-foreground mb-2">
            Detalle de Movimiento
          </h2>
          <p className="text-muted-foreground">
            Información completa del movimiento de stock
          </p>
        </div>
      </div>

      {/* Movement Info Card */}
      {movementInfo && (
        <Card className="p-6 bg-card border-border">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                {movementInfo.type === 'Ingreso' ? (
                  <ArrowUpCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <ArrowDownCircle className="h-5 w-5 text-orange-500" />
                )}
                <span className="text-sm text-muted-foreground">Tipo</span>
              </div>
              <p className="text-lg font-semibold">{movementInfo.type}</p>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Hash className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Nro. Documento</span>
              </div>
              <p className="text-lg font-semibold font-mono">{movementInfo.document_number}</p>
            </div>

            {movementInfo.internal_identifier && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Hash className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Identificador Interno</span>
                </div>
                <p className="text-lg font-semibold font-mono">{movementInfo.internal_identifier}</p>
              </div>
            )}

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Fecha</span>
              </div>
              <p className="text-lg font-semibold">
                {format(new Date(movementInfo.created_at), 'dd/MM/yyyy HH:mm')}
              </p>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <User className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Usuario</span>
              </div>
              <p className="text-lg font-semibold">{movementInfo.created_by_name || 'Sistema'}</p>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Package className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total Items</span>
              </div>
              <p className="text-lg font-semibold">{movementInfo.total_items}</p>
            </div>

            {movementInfo.note && (
              <div className="md:col-span-2 lg:col-span-3">
                <span className="text-sm text-muted-foreground mb-2 block">Nota</span>
                <p className="text-base">{movementInfo.note}</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Details Table */}
      <Card className="p-6 bg-card border-border">
        <h3 className="text-lg font-semibold mb-4">Productos {movementType === 'Ingreso' ? 'Ingresados' : 'Retirados'}</h3>
        
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Variante</TableHead>
                <TableHead>Bin</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                {movementType === 'Ingreso' && <TableHead className="text-right">Costo Unitario</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={movementType === 'Ingreso' ? 6 : 5} className="text-center py-8 text-muted-foreground">
                    Cargando detalles...
                  </TableCell>
                </TableRow>
              ) : details.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={movementType === 'Ingreso' ? 6 : 5} className="text-center py-8 text-muted-foreground">
                    No se encontraron detalles para este movimiento
                  </TableCell>
                </TableRow>
              ) : (
                details.map((detail) => (
                  <TableRow key={detail.id}>
                    <TableCell>
                      <div className="flex items-start gap-2">
                        <Package className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <span className="font-medium">{detail.nombre_producto}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">{detail.sku}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{detail.variante || '-'}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <Badge variant="outline" className="font-mono">
                          {detail.bin_code}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-semibold">{detail.quantity}</span>
                    </TableCell>
                    {movementType === 'Ingreso' && (
                      <TableCell className="text-right">
                        {detail.unit_cost ? (
                          <span className="font-mono">S/ {detail.unit_cost.toFixed(2)}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
