import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, AlertTriangle, CheckCircle, RefreshCw, Shield, Trash2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/hooks/usePermissions";
import { useNavigate } from "react-router-dom";

interface FailedSession {
  id: string;
  created_at: string;
  documento_tipo: string | null;
  created_by_name: string;
  total_items: number;
  tiendas?: {
    nombre: string;
  };
}

export default function RecoverFailedFreePickings() {
  const navigate = useNavigate();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [failedSessions, setFailedSessions] = useState<FailedSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [recovering, setRecovering] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  // Validar permisos al cargar
  useEffect(() => {
    if (!permissionsLoading) {
      if (!hasPermission('recover_zombie_sessions') && !hasPermission('free_picking')) {
        toast.error('Sin permisos', {
          description: 'No tienes permisos para recuperar sesiones zombie'
        });
        navigate('/dashboard');
        return;
      }
      loadFailedSessions();
    }
  }, [permissionsLoading, hasPermission, navigate]);

  const loadFailedSessions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('picking_libre_sessions')
        .select('*, tiendas(nombre)')
        .eq('status', 'completado')
        .is('url_public_view', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFailedSessions(data || []);
    } catch (error: any) {
      toast.error('Error al cargar sesiones fallidas', {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRecover = async (sessionId: string) => {
    setRecovering(sessionId);
    try {
      const { data, error } = await supabase.functions.invoke(
        'recover-failed-free-picking',
        { body: { sessionId } }
      );

      if (error) throw error;

      if (data.success) {
        toast.success('Documento recuperado exitosamente', {
          description: 'La sesión ha sido completada correctamente'
        });
        loadFailedSessions(); // Reload list
      } else {
        throw new Error(data.error || 'Error desconocido');
      }
    } catch (error: any) {
      toast.error('Error al recuperar documento', {
        description: error.message
      });
    } finally {
      setRecovering(null);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    setDeleting(sessionId);
    try {
      const { error } = await supabase
        .from('picking_libre_sessions')
        .delete()
        .eq('id', sessionId);

      if (error) throw error;

      toast.success('Sesión eliminada', {
        description: 'La sesión fallida ha sido eliminada correctamente'
      });
      loadFailedSessions();
    } catch (error: any) {
      toast.error('Error al eliminar sesión', {
        description: error.message
      });
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteAll = async () => {
    setDeletingAll(true);
    try {
      const sessionIds = failedSessions.map(s => s.id);
      
      const { error } = await supabase
        .from('picking_libre_sessions')
        .delete()
        .in('id', sessionIds);

      if (error) throw error;

      toast.success('Todas las sesiones eliminadas', {
        description: `Se eliminaron ${sessionIds.length} sesiones fallidas`
      });
      setShowDeleteAllDialog(false);
      loadFailedSessions();
    } catch (error: any) {
      toast.error('Error al eliminar sesiones', {
        description: error.message
      });
    } finally {
      setDeletingAll(false);
    }
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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-yellow-500" />
                Recuperar Documentos Fallidos - Picking Libre
              </CardTitle>
              <CardDescription>
                Sesiones completadas que no lograron emitir documento a Bsale
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => setShowDeleteAllDialog(true)}
                variant="destructive"
                size="sm"
                disabled={loading || failedSessions.length === 0}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Limpiar Todos
              </Button>
              <Button
                onClick={loadFailedSessions}
                variant="outline"
                size="sm"
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Actualizar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : failedSessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
              <p className="font-medium">No hay sesiones fallidas que recuperar</p>
              <p className="text-sm mt-1">Todas las sesiones han sido procesadas correctamente</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>Nota:</strong> Estas sesiones fueron marcadas como completadas pero no lograron emitir el documento a Bsale.
                  Puedes intentar recuperarlas haciendo clic en el botón "Recuperar Documento".
                </p>
              </div>
              
              {failedSessions.map((session) => (
                <Card key={session.id} className="border-yellow-200 dark:border-yellow-800">
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start gap-4">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-base">
                            PL-{session.id.slice(0, 8).toUpperCase()}
                          </span>
                          <Badge variant="destructive">Sin Documento</Badge>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-muted-foreground">
                          <div>
                            <span className="font-medium">Tienda destino:</span>{' '}
                            {session.tiendas?.nombre || 'N/A'}
                          </div>
                          <div>
                            <span className="font-medium">Tipo documento:</span>{' '}
                            {session.documento_tipo === 'guia_remision' 
                              ? 'Guía de Remisión' 
                              : 'Traslado Interno'}
                          </div>
                          <div>
                            <span className="font-medium">Creado por:</span>{' '}
                            {session.created_by_name}
                          </div>
                          <div>
                            <span className="font-medium">Fecha:</span>{' '}
                            {new Date(session.created_at).toLocaleString()}
                          </div>
                          <div>
                            <span className="font-medium">Total items:</span>{' '}
                            {session.total_items}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 shrink-0">
                        <Button
                          onClick={() => handleRecover(session.id)}
                          disabled={recovering === session.id || deleting === session.id}
                        >
                          {recovering === session.id ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Recuperando...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Recuperar
                            </>
                          )}
                        </Button>
                        <Button
                          onClick={() => handleDeleteSession(session.id)}
                          disabled={recovering === session.id || deleting === session.id}
                          variant="destructive"
                          size="icon"
                        >
                          {deleting === session.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteAllDialog} onOpenChange={setShowDeleteAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar todas las sesiones fallidas?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán permanentemente {failedSessions.length} sesión(es) fallida(s).
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingAll}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAll}
              disabled={deletingAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingAll ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Eliminando...
                </>
              ) : (
                'Eliminar Todas'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
