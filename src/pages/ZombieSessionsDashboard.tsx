import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Ghost, ChevronLeft, RefreshCw, PlayCircle, AlertTriangle, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ZombieSession {
  session_id: string;
  zombie_type: string;
  minutes_inactive: number;
  status: string;
  created_at: string;
  last_activity_at: string;
  last_error: string;
  retry_count: number;
}

interface ZombieStats {
  total_zombies: number;
  por_tipo: Record<string, number>;
  tiempo_inactivo_promedio: number;
  ultimo_check: string;
}

export default function ZombieSessionsDashboard() {
  const navigate = useNavigate();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [zombies, setZombies] = useState<ZombieSession[]>([]);
  const [stats, setStats] = useState<ZombieStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);

  useEffect(() => {
    if (!permissionsLoading) {
      if (!hasPermission('view_zombie_sessions_stats')) {
        toast.error('Sin permisos', {
          description: 'No tienes permisos para ver estadísticas de sesiones zombie'
        });
        navigate('/dashboard');
        return;
      }
      loadZombieData();
    }
  }, [permissionsLoading, hasPermission, navigate]);

  const loadZombieData = async () => {
    setLoading(true);
    try {
      // Detectar zombies
      const { data: zombiesData, error: zombiesError } = await supabase
        .rpc('detect_zombie_sessions');

      if (zombiesError) throw zombiesError;

      setZombies(zombiesData || []);

      // Calcular estadísticas localmente
      if (zombiesData && zombiesData.length > 0) {
        const tipos = zombiesData.reduce((acc: Record<string, number>, z: any) => {
          acc[z.zombie_type] = (acc[z.zombie_type] || 0) + 1;
          return acc;
        }, {});
        
        const avgInactive = zombiesData.reduce((sum: number, z: any) => sum + z.minutes_inactive, 0) / zombiesData.length;
        
        setStats({
          total_zombies: zombiesData.length,
          por_tipo: tipos,
          tiempo_inactivo_promedio: avgInactive,
          ultimo_check: new Date().toISOString()
        });
      } else {
        setStats({ total_zombies: 0, por_tipo: {}, tiempo_inactivo_promedio: 0, ultimo_check: new Date().toISOString() });
      }
    } catch (error: any) {
      console.error('Error loading zombie data:', error);
      toast.error('Error al cargar datos', {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRecoverAll = async () => {
    if (!hasPermission('recover_zombie_sessions')) {
      toast.error('Sin permisos para recuperar sesiones');
      return;
    }

    setRecovering(true);
    try {
      const { data, error } = await supabase.functions.invoke('recover-zombie-sessions', {
        body: { mode: 'manual' }
      });

      if (error) throw error;

      if (data.success) {
        toast.success('Recovery ejecutado', {
          description: `${data.recovered} sesiones recuperadas`
        });
        loadZombieData();
      } else {
        throw new Error(data.error || 'Error desconocido');
      }
    } catch (error: any) {
      toast.error('Error al ejecutar recovery', {
        description: error.message
      });
    } finally {
      setRecovering(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!hasPermission('delete_zombie_sessions')) {
      toast.error('Sin permisos', {
        description: 'No tienes permisos para eliminar sesiones zombie'
      });
      return;
    }

    setDeleting(true);
    try {
      const { data, error } = await supabase.rpc('delete_zombie_session', {
        p_session_id: sessionId
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; stock_released?: number };
      
      if (result.success) {
        toast.success('Sesión eliminada', {
          description: `Stock liberado: ${result.stock_released || 0} unidades`
        });
        setSessionToDelete(null);
        loadZombieData();
      } else {
        throw new Error(result.error || 'Error desconocido');
      }
    } catch (error: any) {
      toast.error('Error al eliminar', {
        description: error.message
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!hasPermission('delete_zombie_sessions')) {
      toast.error('Sin permisos', {
        description: 'No tienes permisos para eliminar sesiones zombie'
      });
      return;
    }

    setDeleting(true);
    try {
      const sessionIds = zombies.map(z => z.session_id);
      
      const { data, error } = await supabase.rpc('delete_multiple_zombie_sessions', {
        p_session_ids: sessionIds
      });

      if (error) throw error;

      const result = data as { 
        success: boolean; 
        deleted: number; 
        failed: number; 
        total_stock_released: number 
      };

      if (result.success) {
        toast.success(`${result.deleted} sesiones eliminadas`, {
          description: `Stock liberado: ${result.total_stock_released} unidades`
        });
      } else {
        toast.warning(`${result.deleted} eliminadas, ${result.failed} fallaron`, {
          description: `Stock liberado: ${result.total_stock_released} unidades`
        });
      }
      
      setDeleteAllConfirm(false);
      loadZombieData();
    } catch (error: any) {
      toast.error('Error al eliminar', {
        description: error.message
      });
    } finally {
      setDeleting(false);
    }
  };

  const getZombieTypeBadge = (tipo: string) => {
    const typeConfig: Record<string, { variant: "default" | "destructive" | "secondary" | "outline", icon: string }> = {
      'abandonado': { variant: 'secondary', icon: '⏱️' },
      'con_error': { variant: 'destructive', icon: '❌' },
      'sin_items': { variant: 'outline', icon: '📦' },
      'emitiendo_mucho_tiempo': { variant: 'destructive', icon: '⚠️' }
    };

    const config = typeConfig[tipo] || { variant: 'outline', icon: '👻' };
    return (
      <Badge variant={config.variant}>
        {config.icon} {tipo.replace(/_/g, ' ')}
      </Badge>
    );
  };

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
              <Ghost className="h-6 w-6" />
              Dashboard de Sesiones Zombie
            </h1>
            <p className="text-muted-foreground">
              Monitoreo y recuperación automática de sesiones abandonadas
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Zombies
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.total_zombies}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Abandonados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">
                {stats.por_tipo?.abandonado || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Con Error
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-destructive">
                {stats.por_tipo?.con_error || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Tiempo Inactivo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {Math.round(stats.tiempo_inactivo_promedio)} min
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Sesiones Zombie Detectadas</CardTitle>
              <CardDescription>
                Sesiones que requieren intervención o recovery automático
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={loadZombieData}
                variant="outline"
                size="sm"
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Actualizar
              </Button>
              {hasPermission('recover_zombie_sessions') && zombies.length > 0 && (
                <Button
                  onClick={handleRecoverAll}
                  variant="default"
                  size="sm"
                  disabled={recovering || deleting}
                >
                  <PlayCircle className={`h-4 w-4 mr-2 ${recovering ? 'animate-spin' : ''}`} />
                  Recuperar Todas
                </Button>
              )}
              {hasPermission('delete_zombie_sessions') && zombies.length > 0 && (
                <Button
                  onClick={() => setDeleteAllConfirm(true)}
                  variant="destructive"
                  size="sm"
                  disabled={recovering || deleting}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar Todas
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : zombies.length === 0 ? (
            <div className="text-center py-12">
              <Ghost className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-lg font-medium text-muted-foreground">
                No hay sesiones zombie detectadas
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                ¡El sistema está funcionando correctamente! 🎉
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Sesión ID</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Creada</TableHead>
                    <TableHead>Reintentos</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead>Inactividad</TableHead>
                    <TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {zombies.map((zombie) => (
                    <TableRow key={zombie.session_id}>
                      <TableCell>
                        {getZombieTypeBadge(zombie.zombie_type)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {zombie.session_id.substring(0, 8)}...
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{zombie.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(zombie.created_at).toLocaleDateString('es-PE')}
                      </TableCell>
                      <TableCell className="text-center">
                        {zombie.retry_count}
                      </TableCell>
                      <TableCell className="text-sm max-w-xs truncate">
                        {zombie.last_error || 'N/A'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {Math.round(zombie.minutes_inactive)} min
                      </TableCell>
                      <TableCell className="text-center">
                        {hasPermission('delete_zombie_sessions') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSessionToDelete(zombie.session_id)}
                            disabled={deleting || recovering}
                            className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {zombies.length > 0 && (
        <Card className="border-yellow-200 dark:border-yellow-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              Información
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              • <strong>Abandonado:</strong> Sesión inactiva &gt;15 min en estado 'escaneando'
            </p>
            <p>
              • <strong>Con error:</strong> Estado 'error' o retry_count &gt; 3
            </p>
            <p>
              • <strong>Sin items:</strong> Estado 'completado' pero sin items escaneados
            </p>
            <p>
              • <strong>Emitiendo mucho tiempo:</strong> Estado 'emitiendo' &gt;5 min
            </p>
            <div className="mt-4 p-3 bg-muted rounded-md">
              <p className="font-medium">Recovery Automático</p>
              <p className="text-muted-foreground mt-1">
                El cron job ejecuta recovery cada 5 minutos. Este dashboard muestra el estado actual.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog de confirmación para eliminar sesión individual */}
      <AlertDialog open={sessionToDelete !== null} onOpenChange={(open) => !open && setSessionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              ¿Eliminar sesión zombie?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es permanente. La sesión se cancelará y todo el stock reservado será liberado.
              <br />
              <br />
              <strong>Esta acción no se puede deshacer.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => sessionToDelete && handleDeleteSession(sessionToDelete)}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Sí, eliminar
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de confirmación para eliminar todas */}
      <AlertDialog open={deleteAllConfirm} onOpenChange={setDeleteAllConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              ¿Eliminar TODAS las sesiones zombie?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de eliminar <strong>{zombies.length} sesiones zombie</strong>.
              <br />
              <br />
              Todas se cancelarán y su stock reservado será liberado. Esta acción es permanente y no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAll}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Sí, eliminar todas
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
