import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Database, AlertTriangle, Info } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
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

interface MigrationModeValue {
  enabled: boolean;
  activated_at: string | null;
  activated_by: string | null;
  activated_by_name: string | null;
}

export function MigrationModeCard() {
  const { toast } = useToast();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingValue, setPendingValue] = useState(false);

  const { data: migrationMode, isLoading } = useQuery({
    queryKey: ['migration-mode'],
    queryFn: async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'migration_mode')
        .maybeSingle();
      
      if (!data?.setting_value) {
        return { enabled: false, activated_at: null, activated_by: null, activated_by_name: null };
      }
      
      const value = data.setting_value as Record<string, any>;
      return {
        enabled: value.enabled === true,
        activated_at: value.activated_at || null,
        activated_by: value.activated_by || null,
        activated_by_name: value.activated_by_name || null,
      } as MigrationModeValue;
    },
  });

  const updateMigrationMode = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from('system_settings')
        .upsert([
          {
            setting_key: 'migration_mode',
            setting_value: {
              enabled,
              activated_at: enabled ? new Date().toISOString() : null,
              activated_by: enabled ? profile?.id : null,
              activated_by_name: enabled ? profile?.full_name : null,
            },
            updated_by: profile?.id,
            updated_at: new Date().toISOString(),
          }
        ], { onConflict: 'setting_key' });

      if (error) throw error;
    },
    onSuccess: (_, enabled) => {
      queryClient.invalidateQueries({ queryKey: ['migration-mode'] });
      toast({
        title: enabled ? "Modo Migración Activado" : "Modo Migración Desactivado",
        description: enabled 
          ? "Las operaciones de stock ya NO se sincronizan con BSale"
          : "Las operaciones de stock vuelven a sincronizarse con BSale",
        variant: enabled ? "default" : "default",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `No se pudo actualizar el modo migración: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleToggle = (checked: boolean) => {
    setPendingValue(checked);
    setShowConfirmDialog(true);
  };

  const confirmToggle = () => {
    updateMigrationMode.mutate(pendingValue);
    setShowConfirmDialog(false);
  };

  return (
    <>
      <Card className="border-orange-500/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-orange-500">
            <Database className="h-5 w-5" />
            Modo Migración
          </CardTitle>
          <CardDescription>
            Permite realizar operaciones de stock sin sincronizar con BSale
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="migration-mode" className="flex flex-col gap-1">
              <span className="font-medium">Estado del Modo Migración</span>
              <span className="text-sm text-muted-foreground font-normal">
                {migrationMode?.enabled ? "Activo" : "Inactivo"}
              </span>
            </Label>
            <Switch
              id="migration-mode"
              checked={migrationMode?.enabled || false}
              onCheckedChange={handleToggle}
              disabled={isLoading}
            />
          </div>

          {migrationMode?.enabled ? (
            <Alert className="bg-orange-500/10 border-orange-500/50">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <AlertDescription className="text-orange-500">
                Las operaciones de ingreso, retiro y sincronización de inventario NO se envían a BSale.
                Solo se modifican las tablas internas del sistema.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Cuando está desactivado, todas las operaciones de stock se sincronizan automáticamente con BSale.
              </AlertDescription>
            </Alert>
          )}

          {migrationMode?.activated_at && migrationMode?.enabled && (
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Activado: {new Date(migrationMode.activated_at).toLocaleString('es-PE')}</p>
              {migrationMode.activated_by_name && (
                <p>Por: {migrationMode.activated_by_name}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingValue ? "¿Activar Modo Migración?" : "¿Desactivar Modo Migración?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingValue ? (
                <>
                  Al activar el modo migración, todas las operaciones de stock (ingresos, retiros, inventarios)
                  <strong className="text-orange-500"> NO se sincronizarán con BSale</strong>.
                  Solo se modificarán las tablas internas del sistema.
                  <br /><br />
                  Usa este modo solo durante migraciones o ajustes masivos de inventario.
                </>
              ) : (
                <>
                  Al desactivar el modo migración, todas las operaciones de stock volverán a sincronizarse
                  automáticamente con BSale.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmToggle}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
