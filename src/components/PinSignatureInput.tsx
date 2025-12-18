import { useState, useEffect } from 'react';
import { CheckCircle2, Lock, AlertCircle } from 'lucide-react';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useSignaturePin } from "@/hooks/useSignaturePin";
import { cn } from "@/lib/utils";

interface PinSignatureInputProps {
  orderId: string;
  orderCode: string;
  orderType: 'pedido' | 'venta' | 'picking_libre';
  orderDestination?: string;
  onSignSuccess: (signerName: string, signedAt: string) => void;
  onCancel?: () => void;
  showNotesField?: boolean;
  disabled?: boolean;
  overrideSignerName?: string;
  overrideSignerId?: string;
}

export default function PinSignatureInput({
  orderId,
  orderCode,
  orderType,
  orderDestination,
  onSignSuccess,
  onCancel,
  showNotesField = true,
  disabled = false,
  overrideSignerName,
  overrideSignerId
}: PinSignatureInputProps) {
  const [pin, setPin] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [shakeError, setShakeError] = useState(false);
  
  const {
    validateAndSign,
    isValidating,
    error,
    attemptsRemaining,
    isLocked,
    lockUntil
  } = useSignaturePin();

  // Auto-validate when 6 digits are entered
  useEffect(() => {
    if (pin.length === 6 && !isValidating && !isLocked) {
      handleValidate();
    }
  }, [pin]);

  // Trigger shake animation on error
  useEffect(() => {
    if (error) {
      setShakeError(true);
      setTimeout(() => setShakeError(false), 500);
      // Clear PIN after error
      setTimeout(() => setPin(''), 500);
    }
  }, [error]);

  const handleValidate = async () => {
    const result = await validateAndSign(
      pin,
      orderId,
      orderType,
      orderCode,
      reviewNotes.trim() || undefined,
      overrideSignerName,
      overrideSignerId
    );

    if (result.success && result.signerName && result.signedAt) {
      setIsSuccess(true);
      setTimeout(() => {
        onSignSuccess(result.signerName!, result.signedAt!);
      }, 1000);
    }
  };

  const getLockTimeRemaining = (): number => {
    if (!lockUntil) return 0;
    return Math.max(0, Math.ceil((lockUntil.getTime() - new Date().getTime()) / 1000));
  };

  const getOrderTypeLabel = () => {
    switch (orderType) {
      case 'pedido':
        return 'Pedido';
      case 'venta':
        return 'Venta';
      case 'picking_libre':
        return 'Picking Libre';
      default:
        return 'Orden';
    }
  };

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-8 space-y-4">
        <div className="rounded-full bg-green-100 p-3">
          <CheckCircle2 className="h-12 w-12 text-green-600" />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-semibold text-green-600">
            ¡Firmado exitosamente!
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Continuando...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>
            PIN de Firma Digital
          </Label>
          {isLocked && (
            <span className="text-sm text-destructive flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Bloqueado: {getLockTimeRemaining()}s
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Ingresa tu PIN de 6 dígitos para firmar {getOrderTypeLabel()} {orderCode}
          {orderDestination && ` - ${orderDestination}`}
        </p>
      </div>

      <div className="flex flex-col items-center space-y-4">
        <InputOTP
          maxLength={6}
          value={pin}
          onChange={setPin}
          disabled={disabled || isValidating || isLocked}
          className={cn(
            "transition-all",
            shakeError && "animate-shake"
          )}
        >
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <InputOTPSlot
                key={index}
                index={index}
                mask={true}
                className={cn(
                  "transition-all w-12 h-14 text-2xl font-bold",
                  "border-2 bg-background text-foreground",
                  "focus:border-primary focus:ring-2 focus:ring-primary/20",
                  isSuccess && "border-green-500 bg-green-50 text-green-900",
                  error && "border-destructive bg-destructive/10",
                  isValidating && "opacity-50",
                  isLocked && "opacity-30 cursor-not-allowed"
                )}
              />
            ))}
          </InputOTPGroup>
        </InputOTP>

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        {isValidating && (
          <p className="text-sm text-muted-foreground">
            Validando...
          </p>
        )}

        {!isLocked && attemptsRemaining < 3 && !error && (
          <p className="text-sm text-amber-600">
            Intentos restantes: {attemptsRemaining}
          </p>
        )}
      </div>

      {showNotesField && (
        <Collapsible open={showNotes} onOpenChange={setShowNotes}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full">
              {showNotes ? 'Ocultar' : 'Agregar'} observaciones (opcional)
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 mt-2">
            <Label htmlFor="notes">Observaciones</Label>
            <Textarea
              id="notes"
              placeholder="Agregar comentarios sobre la revisión..."
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              rows={3}
              disabled={disabled || isValidating}
            />
            <p className="text-xs text-muted-foreground">
              Al firmar confirmas que has verificado físicamente los productos.
            </p>
          </CollapsibleContent>
        </Collapsible>
      )}

      {onCancel && (
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isValidating}
          className="w-full"
        >
          Cancelar
        </Button>
      )}

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
}
