import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, Package, X, PlayCircle, Smartphone, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { getDeviceId, isCurrentDevice } from '@/lib/deviceId';

interface ActiveSession {
  id: string;
  created_at: string;
  updated_at: string;
  total_items: number;
  status: string;
  device_id: string | null;
}

interface ActivePickingSessionsProps {
  onResumeSession: (sessionId: string) => void;
  onCancelSession: (sessionId: string) => void;
}

export function ActivePickingSessions({ onResumeSession, onCancelSession }: ActivePickingSessionsProps) {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);

  const loadActiveSessions = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('picking_libre_sessions')
        .select('id, created_at, updated_at, total_items, status, device_id')
        .eq('created_by', user.id)
        .eq('status', 'en_proceso')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setSessions(data || []);
    } catch (error) {
      console.error('Error loading active sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActiveSessions();

    // Realtime updates for sessions
    const channel = supabase
      .channel('active-picking-sessions')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'picking_libre_sessions',
          filter: `created_by=eq.${user?.id}`
        },
        () => {
          loadActiveSessions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  if (loading) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground text-center">Cargando sesiones...</p>
      </Card>
    );
  }

  if (sessions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-2">Sesiones Activas</h3>
        <p className="text-sm text-muted-foreground">
          Tienes {sessions.length} {sessions.length === 1 ? 'sesión activa' : 'sesiones activas'}
        </p>
      </div>

      <div className="grid gap-3">
        {sessions.map((session) => {
          const isOtherDevice = session.device_id && !isCurrentDevice(session.device_id);
          
          return (
            <Card key={session.id} className={`p-4 border-border ${isOtherDevice ? 'border-amber-500/50 bg-amber-50/10' : ''}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="font-mono text-xs">
                      {session.id.slice(0, 8)}
                    </Badge>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Package className="h-3 w-3" />
                      <span>{session.total_items} productos</span>
                    </div>
                    {isOtherDevice && (
                      <Badge variant="outline" className="text-amber-600 border-amber-500 text-xs">
                        <Smartphone className="h-3 w-3 mr-1" />
                        Otro dispositivo
                      </Badge>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>
                      Última actividad:{' '}
                      {formatDistanceToNow(new Date(session.updated_at), {
                        addSuffix: true,
                        locale: es
                      })}
                    </span>
                  </div>

                  {isOtherDevice && (
                    <div className="flex items-center gap-1 text-xs text-amber-600">
                      <AlertTriangle className="h-3 w-3" />
                      <span>Sesión activa en otro dispositivo. Retomar aquí tomará el control.</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    size="sm"
                    variant={isOtherDevice ? "default" : "outline"}
                    onClick={() => onResumeSession(session.id)}
                    className="whitespace-nowrap"
                  >
                    <PlayCircle className="h-4 w-4 mr-1" />
                    {isOtherDevice ? 'Tomar control' : 'Retomar'}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      await onCancelSession(session.id);
                      loadActiveSessions();
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
