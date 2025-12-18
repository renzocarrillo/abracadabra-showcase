import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { FileSpreadsheet, DollarSign, Receipt, CreditCard, AlertCircle, Download } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';

interface VentaResumen {
  id: string;
  venta_id: string;
  created_at: string;
  total: number;
  vendedor_nombre: string;
  metodo_pago: string;
  cliente_nombre: string;
  numero_operacion?: string;
  estado: string;
  documentoEmitido: boolean;
  serial_number?: string;
}

interface PagoResumen {
  metodo_pago: string;
  cantidad: number;
  total: number;
}

export default function SalesReport() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasPermission, userType, isAdmin, loading: permissionsLoading } = usePermissions();
  const [loading, setLoading] = useState(false);
  const [ventas, setVentas] = useState<VentaResumen[]>([]);
  const [pagosSummary, setPagosSummary] = useState<PagoResumen[]>([]);
  
  // Default to current month
  const [fechaDesde, setFechaDesde] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [fechaHasta, setFechaHasta] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

  // Check permissions on mount - wait for permissions to load
  useEffect(() => {
    if (permissionsLoading) return; // Wait for permissions to load
    
    const isCabezaTienda = userType?.name === 'cabeza_de_tienda';
    const hasAccess = (hasPermission('view_sales') || hasPermission('manage_sales') || isAdmin()) && !isCabezaTienda;
    const isSupervisor = userType?.name === 'supervisor';
    
    if (!hasAccess && !isSupervisor) {
      toast({
        title: 'Acceso denegado',
        description: 'No tienes permisos para ver esta página',
        variant: 'destructive',
      });
      navigate('/dashboard');
    }
  }, [hasPermission, isAdmin, userType, navigate, toast, permissionsLoading]);

  useEffect(() => {
    fetchVentas();
  }, []);

  const fetchVentas = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('ventas')
        .select(`
          id,
          venta_id,
          created_at,
          total,
          estado,
          cliente_info,
          metodo_pago,
          numero_operacion,
          seller_id,
          serial_number,
          url_public_view,
          sellers!ventas_seller_id_fkey (
            id,
            firstName,
            lastName
          )
        `)
        .gte('created_at', `${fechaDesde}T00:00:00`)
        .lte('created_at', `${fechaHasta}T23:59:59`)
        .neq('estado', 'cancelada')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const ventasFormateadas: VentaResumen[] = (data || []).map((v: any) => {
        // Extract client name from cliente_info JSONB
        const clienteInfo = v.cliente_info || {};
        const clienteNombre = clienteInfo.firstName && clienteInfo.lastName 
          ? `${clienteInfo.firstName} ${clienteInfo.lastName}`.trim()
          : clienteInfo.nombre || 'Cliente General';

        // Extract seller name
        const vendedorNombre = v.sellers 
          ? `${v.sellers.firstName || ''} ${v.sellers.lastName || ''}`.trim() || 'Sin vendedor'
          : 'Sin vendedor';

        return {
          id: v.id,
          venta_id: v.venta_id,
          created_at: v.created_at,
          total: v.total || 0,
          vendedor_nombre: vendedorNombre,
          metodo_pago: v.metodo_pago || 'No especificado',
          cliente_nombre: clienteNombre,
          numero_operacion: v.numero_operacion || undefined,
          estado: v.estado,
          documentoEmitido: !!(v.serial_number || v.url_public_view),
          serial_number: v.serial_number || undefined,
        };
      });

      setVentas(ventasFormateadas);
      
      // Calculate summary by payment method
      const pagoMap = new Map<string, { cantidad: number; total: number }>();
      ventasFormateadas.forEach(v => {
        const current = pagoMap.get(v.metodo_pago) || { cantidad: 0, total: 0 };
        pagoMap.set(v.metodo_pago, {
          cantidad: current.cantidad + 1,
          total: current.total + v.total
        });
      });

      const pagosArray = Array.from(pagoMap.entries()).map(([metodo_pago, data]) => ({
        metodo_pago,
        ...data
      }));

      setPagosSummary(pagosArray);

    } catch (error: any) {
      console.error('Error fetching ventas:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las ventas',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBuscar = () => {
    fetchVentas();
  };

  const totalVendido = ventas.reduce((sum, v) => sum + v.total, 0);
  const totalBoletas = ventas.filter(v => v.documentoEmitido).length;
  const totalVentas = ventas.length;

  const requiereNumeroOperacion = (metodoPago: string) => {
    const metodos = ['transferencia', 'yape', 'plin', 'tunki'];
    return metodos.some(m => metodoPago.toLowerCase().includes(m));
  };

  const downloadCSV = () => {
    // Prepare CSV headers
    const headers = ['Fecha', 'N° Venta', 'Nº Serie', 'Cliente', 'Vendedor', 'Método de Pago', 'N° Operación', 'Total', 'Estado'];
    
    // Prepare CSV rows
    const rows = ventas.map(venta => [
      format(new Date(venta.created_at), 'dd/MM/yyyy HH:mm', { locale: es }),
      venta.venta_id,
      venta.serial_number || 'Sin emitir',
      venta.cliente_nombre,
      venta.vendedor_nombre,
      venta.metodo_pago,
      venta.numero_operacion || 'N/A',
      `S/ ${venta.total.toFixed(2)}`,
      venta.documentoEmitido ? 'Emitido' : 'Sin emitir'
    ]);
    
    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `ventas_${fechaDesde}_${fechaHasta}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Resumen de Ventas</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Visualiza el reporte de ventas por período
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Selecciona el rango de fechas para el reporte</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fechaDesde">Fecha Desde</Label>
              <Input
                id="fechaDesde"
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fechaHasta">Fecha Hasta</Label>
              <Input
                id="fechaHasta"
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleBuscar} disabled={loading} className="w-full">
                {loading ? 'Cargando...' : 'Buscar'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Vendido</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">S/ {totalVendido.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              {totalVentas} {totalVentas === 1 ? 'venta' : 'ventas'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Boletas Emitidas</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalBoletas}</div>
            <p className="text-xs text-muted-foreground">
              De {totalVentas} {totalVentas === 1 ? 'venta' : 'ventas'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Métodos de Pago</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pagosSummary.length}</div>
            <p className="text-xs text-muted-foreground">
              Diferentes métodos utilizados
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Payment Methods Summary */}
      {pagosSummary.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resumen por Método de Pago</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Método de Pago</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
              {pagosSummary.map((pago) => (
                <TableRow key={pago.metodo_pago}>
                  <TableCell className="font-medium">{pago.metodo_pago}</TableCell>
                  <TableCell className="text-right">{pago.cantidad}</TableCell>
                  <TableCell className="text-right">S/ {pago.total.toFixed(2)}</TableCell>
                </TableRow>
              ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Sales List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-lg sm:text-xl">Detalle de Ventas</CardTitle>
              <CardDescription className="text-sm">
                Lista completa de ventas en el período seleccionado
              </CardDescription>
            </div>
            <Button 
              onClick={downloadCSV} 
              disabled={ventas.length === 0}
              variant="outline"
              size="sm"
              className="gap-2 w-full sm:w-auto"
            >
              <Download className="h-4 w-4" />
              <span className="sm:inline">Descargar CSV</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>N° Venta</TableHead>
                  <TableHead>Nº Serie</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Método de Pago</TableHead>
                  <TableHead>N° Operación</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      Cargando ventas...
                    </TableCell>
                  </TableRow>
                ) : ventas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      No hay ventas en el período seleccionado
                    </TableCell>
                  </TableRow>
                ) : (
                  ventas.map((venta) => (
                    <TableRow key={venta.id}>
                      <TableCell>
                        {format(new Date(venta.created_at), 'dd/MM/yyyy HH:mm', { locale: es })}
                      </TableCell>
                      <TableCell className="font-medium">{venta.venta_id}</TableCell>
                      <TableCell>
                        {venta.serial_number ? (
                          <Badge variant="secondary">{venta.serial_number}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">Sin emitir</span>
                        )}
                      </TableCell>
                      <TableCell>{venta.cliente_nombre}</TableCell>
                      <TableCell>{venta.vendedor_nombre}</TableCell>
                      <TableCell>{venta.metodo_pago}</TableCell>
                      <TableCell>
                        {requiereNumeroOperacion(venta.metodo_pago) ? (
                          venta.numero_operacion ? (
                            <div className="flex flex-wrap gap-1">
                              {venta.numero_operacion.split(',').map((op, idx) => (
                                <Badge key={idx} variant="secondary">{op.trim()}</Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">Sin registrar</span>
                          )
                        ) : (
                          <span className="text-muted-foreground text-xs">N/A</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        S/ {venta.total.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant={venta.documentoEmitido ? 'default' : 'secondary'}>
                            {venta.documentoEmitido ? 'Emitido' : 'Sin emitir'}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {venta.estado}
                          </Badge>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card View */}
          <div className="lg:hidden space-y-3">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Cargando ventas...
              </div>
            ) : ventas.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No hay ventas en el período seleccionado
              </div>
            ) : (
              ventas.map((venta) => (
                <Card key={venta.id} className="p-4">
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-sm">{venta.venta_id}</div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(venta.created_at), 'dd/MM/yyyy HH:mm', { locale: es })}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg">S/ {venta.total.toFixed(2)}</div>
                      </div>
                    </div>

                    {/* Details */}
                    <div className="space-y-2 text-sm">
                      {venta.serial_number && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground text-xs">Nº Serie:</span>
                          <Badge variant="secondary" className="text-xs">{venta.serial_number}</Badge>
                        </div>
                      )}
                      
                      <div>
                        <span className="text-muted-foreground text-xs">Cliente: </span>
                        <span>{venta.cliente_nombre}</span>
                      </div>
                      
                      <div>
                        <span className="text-muted-foreground text-xs">Vendedor: </span>
                        <span>{venta.vendedor_nombre}</span>
                      </div>
                      
                      <div>
                        <span className="text-muted-foreground text-xs">Método de pago: </span>
                        <span>{venta.metodo_pago}</span>
                      </div>

                      {requiereNumeroOperacion(venta.metodo_pago) && (
                        <div>
                          <span className="text-muted-foreground text-xs">N° Operación: </span>
                          {venta.numero_operacion ? (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {venta.numero_operacion.split(',').map((op, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs">{op.trim()}</Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">Sin registrar</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Status Badges */}
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={venta.documentoEmitido ? 'default' : 'secondary'} className="text-xs">
                        {venta.documentoEmitido ? 'Emitido' : 'Sin emitir'}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {venta.estado}
                      </Badge>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
