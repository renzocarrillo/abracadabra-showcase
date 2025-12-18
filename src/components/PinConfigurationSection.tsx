import { useState, useEffect } from 'react';
import { CheckCircle2, Lock, AlertCircle, Key } from 'lucide-react';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from '@/integrations/supabase/client';
import { useSignaturePin } from '@/hooks/useSignaturePin';
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

export default function PinConfigurationSection() {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [hasPin, setHasPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const { toast } = useToast();
  const { checkUserHasPin } = useSignaturePin();

  useEffect(() => {
    checkPinStatus();
  }, []);

  const checkPinStatus = async () => {
    setChecking(true);
    const hasPinConfigured = await checkUserHasPin();
    setHasPin(hasPinConfigured);
    setChecking(false);
  };

  const handleSavePin = async () => {
    // Validation
    if (pin.length !== 6) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "El PIN debe tener exactamente 6 dígitos"
      });
      return;
    }

    if (pin !== confirmPin) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Los PIN no coinciden"
      });
      return;
    }

    // If user already has PIN, show confirmation dialog
    if (hasPin) {
      setShowConfirmDialog(true);
      return;
    }

    // Otherwise, proceed with saving
    await savePin();
  };

  const savePin = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('set_signature_pin', {
        p_pin: pin
      });

      if (error) throw error;

      const result = data as { success: boolean; message?: string; error?: string };

      if (!result.success) {
        throw new Error(result.error || 'Error al configurar PIN');
      }

      toast({
        title: "Éxito",
        description: result.message || "PIN configurado correctamente"
      });

      setPin('');
      setConfirmPin('');
      setHasPin(true);
      setShowConfirmDialog(false);

    } catch (error: any) {
      console.error('Error saving PIN:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Error al configurar el PIN"
      });
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">Verificando estado del PIN...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            <CardTitle>PIN de Firma Digital</CardTitle>
          </div>
          <CardDescription>
            Configura tu PIN de 6 dígitos para firmar pedidos, ventas y sesiones de picking libre.
            Este PIN es personal e intransferible.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current status */}
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
            {hasPin ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium">PIN configurado</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-5 w-5 text-amber-600" />
                <span className="text-sm font-medium">Sin PIN - Configura uno para poder firmar</span>
              </>
            )}
          </div>

          {/* PIN Input */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{hasPin ? 'Nuevo PIN' : 'PIN'} (6 dígitos)</Label>
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={pin}
                  onChange={setPin}
                  disabled={loading}
                >
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5].map((index) => (
                      <InputOTPSlot 
                        key={index} 
                        index={index}
                        className="w-12 h-14 text-2xl font-bold border-2 bg-background text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Confirmar PIN</Label>
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={confirmPin}
                  onChange={setConfirmPin}
                  disabled={loading}
                >
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5].map((index) => (
                      <InputOTPSlot 
                        key={index} 
                        index={index}
                        className={`w-12 h-14 text-2xl font-bold border-2 bg-background text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 ${
                          confirmPin.length === 6 && pin !== confirmPin
                            ? "border-destructive"
                            : ""
                        }`}
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              {confirmPin.length === 6 && pin !== confirmPin && (
                <p className="text-xs text-destructive text-center">
                  Los PIN no coinciden
                </p>
              )}
            </div>

            <Button
              onClick={handleSavePin}
              disabled={loading || pin.length !== 6 || confirmPin.length !== 6 || pin !== confirmPin}
              className="w-full"
            >
              <Lock className="mr-2 h-4 w-4" />
              {loading ? 'Guardando...' : hasPin ? 'Cambiar PIN' : 'Guardar PIN'}
            </Button>

            {hasPin && (
              <p className="text-xs text-muted-foreground text-center">
                Al cambiar tu PIN, el anterior dejará de funcionar inmediatamente.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cambiar PIN de firma?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de cambiar tu PIN de firma digital. El PIN anterior dejará de funcionar
              inmediatamente. ¿Deseas continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={savePin} disabled={loading}>
              {loading ? 'Guardando...' : 'Confirmar cambio'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
