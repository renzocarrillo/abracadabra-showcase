import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Search, ArrowUpCircle, ArrowDownCircle, Calendar, User, Hash, AlertCircle, Eye, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';


interface StockMovement {
  id: string;
  type: 'Ingreso' | 'Retiro';
  document_number: number;
  created_at: string;
  created_by: string | null;
  created_by_name: string | null;
  internal_identifier: string | null;
  total_items: number;
  note: string | null;
  bsale_response: any;
}

export default function StockMovementsLog() {
  const { isAdmin, userType, loading: permissionsLoading } = usePermissions();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isBackfilling, setIsBackfilling] = useState(false);
  
  // Check if user has permission to view logs
  const canViewLogs = isAdmin() || userType?.name === 'supervisor';

  const handleBackfill = async () => {
    if (!isAdmin()) {
      toast.error('Solo administradores pueden ejecutar el backfill');
      return;
    }

    const confirmed = window.confirm(
      '¿Estás seguro de que deseas recuperar los detalles históricos de movimientos de stock desde BSale?\n\n' +
      'Este proceso puede tomar varios minutos dependiendo de la cantidad de movimientos.'
    );

    if (!confirmed) return;

    setIsBackfilling(true);
    toast.info('Iniciando backfill de detalles históricos...');

    try {
      const { data, error } = await supabase.functions.invoke('backfill-stock-movement-details');

      if (error) throw error;

      toast.success(
        `Backfill completado exitosamente!\n\n` +
        `Ingresos procesados: ${data.stats.receptions_processed}\n` +
        `Retiros procesados: ${data.stats.consumptions_processed}\n` +
        `Detalles insertados: ${data.stats.details_inserted}`
      );
    } catch (error: any) {
      console.error('Error en backfill:', error);
      toast.error(`Error al ejecutar backfill: ${error.message}`);
    } finally {
      setIsBackfilling(false);
    }
  };

  const navigate = (path: string) => {
    window.location.href = path;
  };

  // Fetch stock movements
  const { data: movements = [], isLoading } = useQuery({
    queryKey: ['stock-movements'],
    queryFn: async () => {
      // Fetch receptions
      const { data: receptions, error: receptionsError } = await supabase
        .from('stock_receptions')
        .select('*')
        .order('created_at', { ascending: false });

      if (receptionsError) throw receptionsError;

      // Fetch consumptions
      const { data: consumptions, error: consumptionsError } = await supabase
        .from('stock_consumptions')
        .select('*')
        .order('created_at', { ascending: false });

      if (consumptionsError) throw consumptionsError;

      // Combine and map
      const combined: StockMovement[] = [
        ...(receptions || []).map(r => ({ ...r, type: 'Ingreso' as const })),
        ...(consumptions || []).map(c => ({ ...c, type: 'Retiro' as const }))
      ];

      // Sort by date descending
      combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      return combined;
    },
  });

  // Filter movements
  const filteredMovements = movements.filter(movement => {
    // Type filter
    if (typeFilter !== 'all' && movement.type !== typeFilter) return false;

    // Search filter (internal_identifier, document_number, created_by_name)
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const matchesId = movement.internal_identifier?.toLowerCase().includes(search);
      const matchesDoc = movement.document_number?.toString().includes(search);
      const matchesUser = movement.created_by_name?.toLowerCase().includes(search);
      if (!matchesId && !matchesDoc && !matchesUser) return false;
    }

    // Date range filter
    if (dateFrom && new Date(movement.created_at) < new Date(dateFrom)) return false;
    if (dateTo && new Date(movement.created_at) > new Date(dateTo + 'T23:59:59')) return false;

    return true;
  });

  const getBsaleStatus = (movement: StockMovement) => {
    if (!movement.bsale_response) {
      return <Badge variant="secondary">Sin sync BSale</Badge>;
    }
    return <Badge variant="default">Sincronizado</Badge>;
  };

  // Show loading state while checking permissions
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

  // Show access denied if user doesn't have permission
  if (!canViewLogs) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No tienes permisos para acceder a esta página. Solo administradores y supervisores pueden ver los logs de movimientos de stock.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Logs de Movimientos de Stock</h2>
          <p className="text-muted-foreground">Historial completo de ingresos y retiros de inventario</p>
        </div>
        {isAdmin() && (
          <Button
            onClick={handleBackfill}
            disabled={isBackfilling}
            variant="outline"
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isBackfilling ? 'animate-spin' : ''}`} />
            {isBackfilling ? 'Recuperando...' : 'Recuperar Detalles Históricos'}
          </Button>
        )}
      </div>


      <Card className="p-6 bg-card border-border">
        <div className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">
                Buscar
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Identificador, documento, usuario..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">
                Tipo
              </label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="Ingreso">Ingresos</SelectItem>
                  <SelectItem value="Retiro">Retiros</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">
                Desde
              </label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">
                Hasta
              </label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          {/* Results count */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{filteredMovements.length} movimientos encontrados</span>
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setTypeFilter('all');
                  setDateFrom('');
                  setDateTo('');
                }}
                className="text-primary hover:underline"
              >
                Limpiar filtros
              </button>
            )}
          </div>

          {/* Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Identificador Interno</TableHead>
                  <TableHead>Nro. Documento</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Estado BSale</TableHead>
                  <TableHead>Nota</TableHead>
                  <TableHead className="text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Cargando movimientos...
                    </TableCell>
                  </TableRow>
                ) : filteredMovements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No se encontraron movimientos
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMovements.map((movement) => (
                    <TableRow key={`${movement.type}-${movement.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {movement.type === 'Ingreso' ? (
                            <ArrowUpCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <ArrowDownCircle className="h-4 w-4 text-orange-500" />
                          )}
                          <span className="font-medium">{movement.type}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {format(new Date(movement.created_at), 'dd/MM/yyyy HH:mm')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm">
                          <User className="h-4 w-4 text-muted-foreground" />
                          {movement.created_by_name || 'Sistema'}
                        </div>
                      </TableCell>
                      <TableCell>
                        {movement.internal_identifier ? (
                          <div className="flex items-center gap-2">
                            <Hash className="h-4 w-4 text-muted-foreground" />
                            <span className="font-mono text-sm">{movement.internal_identifier}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono">{movement.document_number}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{movement.total_items} items</Badge>
                      </TableCell>
                      <TableCell>{getBsaleStatus(movement)}</TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground truncate max-w-xs block">
                          {movement.note || '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/productos/logs/${movement.id}?type=${movement.type}`)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Ver detalle
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </Card>
    </div>
  );
}
