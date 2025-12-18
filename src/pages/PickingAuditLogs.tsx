import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, FileText, Search, Filter, ChevronLeft, AlertCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AuditLog {
  id: string;
  created_at: string;
  event_type: string;
  event_status: string;
  session_id: string | null;
  user_id: string | null;
  user_name: string | null;
  duration_ms: number | null;
  error_message: string | null;
  details: any;
  retry_count: number | null;
}

export default function PickingAuditLogs() {
  const navigate = useNavigate();
  const { hasPermission, loading: permissionsLoading, isAdmin } = usePermissions();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");

  // Validar permisos
  useEffect(() => {
    if (!permissionsLoading) {
      if (!hasPermission('view_picking_audit_logs')) {
        toast.error('Sin permisos', {
          description: 'No tienes permisos para ver logs de auditoría'
        });
        navigate('/dashboard');
        return;
      }
      loadLogs();
    }
  }, [permissionsLoading, hasPermission, navigate]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('picking_libre_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      // Si no es admin, solo ver sus propios logs
      if (!isAdmin()) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          query = query.eq('user_id', user.id);
        }
      }

      const { data, error } = await query;

      if (error) throw error;
      setLogs(data || []);
    } catch (error: any) {
      toast.error('Error al cargar logs', {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      success: { variant: "default" as const, label: "Éxito" },
      error: { variant: "destructive" as const, label: "Error" },
      warning: { variant: "secondary" as const, label: "Advertencia" },
      info: { variant: "outline" as const, label: "Info" }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.info;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      !searchQuery ||
      log.event_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.user_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.error_message?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || log.event_status === statusFilter;
    const matchesEventType = eventTypeFilter === 'all' || log.event_type === eventTypeFilter;

    return matchesSearch && matchesStatus && matchesEventType;
  });

  const uniqueEventTypes = Array.from(new Set(logs.map(l => l.event_type))).sort();

  if (permissionsLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="py-8">
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-muted-foreground">Validando permisos...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
            <ChevronLeft className="h-4 w-4" />
            Volver
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6" />
              Logs de Auditoría - Picking Libre
            </h1>
            <p className="text-muted-foreground">
              Registro detallado de todas las operaciones del sistema
            </p>
          </div>
        </div>
        <Button onClick={loadLogs} variant="outline" disabled={loading}>
          <Search className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Filtra los logs por estado, tipo de evento o búsqueda</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Buscar</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar en logs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Estado</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="success">Éxito</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="warning">Advertencia</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo de Evento</label>
              <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {uniqueEventTypes.map(type => (
                    <SelectItem key={type} value={type}>
                      {type.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registros de Auditoría ({filteredLogs.length})</CardTitle>
          <CardDescription>
            {isAdmin() 
              ? 'Mostrando todos los logs del sistema' 
              : 'Mostrando solo tus logs'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto mb-2" />
              <p className="font-medium">No se encontraron logs</p>
              <p className="text-sm mt-1">Ajusta los filtros o realiza algunas operaciones</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Duración</TableHead>
                    <TableHead>Sesión ID</TableHead>
                    <TableHead>Reintentos</TableHead>
                    <TableHead>Detalles</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs">
                        {new Date(log.created_at).toLocaleString('es-PE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {log.event_type.replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(log.event_status)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.user_name || 'Sistema'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {log.duration_ms ? `${log.duration_ms}ms` : '-'}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {log.session_id ? log.session_id.substring(0, 8) + '...' : '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        {log.retry_count !== null ? (
                          <Badge variant={log.retry_count > 0 ? "secondary" : "outline"}>
                            {log.retry_count}
                          </Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="max-w-md">
                        {log.error_message ? (
                          <div className="text-xs text-destructive">
                            {log.error_message.substring(0, 100)}
                            {log.error_message.length > 100 && '...'}
                          </div>
                        ) : log.details ? (
                          <div className="text-xs text-muted-foreground">
                            {JSON.stringify(log.details).substring(0, 100)}...
                          </div>
                        ) : '-'}
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