import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, FileSignature } from "lucide-react";

interface OrderSignatureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderCode: string;
  orderType: 'pedido' | 'venta' | 'picking_libre';
  onSign: (notes?: string) => Promise<boolean>;
  signature?: {
    signed_by_name: string;
    signed_at: string;
    review_notes?: string;
  };
}

export default function OrderSignatureModal({
  open,
  onOpenChange,
  orderCode,
  orderType,
  onSign,
  signature
}: OrderSignatureModalProps) {
  const [reviewNotes, setReviewNotes] = useState('');
  const [signing, setSigning] = useState(false);

  const handleSign = async () => {
    setSigning(true);
    const success = await onSign(reviewNotes.trim() || undefined);
    if (success) {
      setReviewNotes('');
      onOpenChange(false);
    }
    setSigning(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <FileSignature className="h-5 w-5" />
            <DialogTitle>
              Firmar Revisión - {orderType === 'pedido' ? 'Pedido' : orderType === 'venta' ? 'Venta' : 'Picking Libre'} {orderCode}
            </DialogTitle>
          </div>
          <DialogDescription>
            {signature ? (
              "Esta operación ya ha sido firmada por un supervisor/administrador."
            ) : (
              "Confirma que has revisado y verificado los productos de esta operación."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {signature ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  Firmado
                </Badge>
              </div>
              
              <div className="grid gap-2">
                <Label className="text-sm font-medium">Firmado por:</Label>
                <p className="text-sm text-muted-foreground">{signature.signed_by_name}</p>
              </div>

              <div className="grid gap-2">
                <Label className="text-sm font-medium">Fecha de firma:</Label>
                <p className="text-sm text-muted-foreground">
                  {formatDate(signature.signed_at)}
                </p>
              </div>

              {signature.review_notes && (
                <div className="grid gap-2">
                  <Label className="text-sm font-medium">Observaciones:</Label>
                  <div className="rounded-md border p-3 bg-muted/50">
                    <p className="text-sm">{signature.review_notes}</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="notes">Observaciones (opcional)</Label>
              <Textarea
                id="notes"
                placeholder="Agregar comentarios sobre la revisión..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Al firmar confirmas que has verificado físicamente los productos de esta operación.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {signature ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!signature && (
            <Button onClick={handleSign} disabled={signing}>
              {signing ? 'Firmando...' : 'Firmar Revisión'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}