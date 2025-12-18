import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { BarcodeScanner } from './BarcodeScanner';
import { CheckCircle2, Circle } from 'lucide-react';
import { VerificationItem } from '@/hooks/usePickingSession';

interface VerificationViewProps {
  verificationItems: VerificationItem[];
  onScan: (code: string) => void;
}

export function VerificationView({ verificationItems, onScan }: VerificationViewProps) {
  const totalProducts = verificationItems.reduce((sum, item) => sum + item.totalQuantity, 0);
  const verifiedProducts = verificationItems.reduce((sum, item) => sum + item.verifiedQuantity, 0);
  const progress = totalProducts > 0 ? (verifiedProducts / totalProducts) * 100 : 0;
  const verifiedItemsCount = verificationItems.filter(item => item.isVerified).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Verificación de Productos</span>
            <Badge variant="outline">
              {verifiedItemsCount}/{verificationItems.length} productos
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progreso total</span>
              <span className="font-medium">{verifiedProducts}/{totalProducts} unidades</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          <BarcodeScanner
            onScan={onScan}
            placeholder="Escanee producto para verificar..."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Lista de Verificación</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {verificationItems.map((item) => (
              <div
                key={item.sku}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  item.isVerified ? 'bg-success/5 border-success/20' : 'bg-card'
                }`}
              >
                <div className="flex items-center gap-3 flex-1">
                  {item.isVerified ? (
                    <CheckCircle2 className="h-5 w-5 text-success" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-sm">{item.nombre_producto}</p>
                    {item.variante && (
                      <p className="text-xs text-muted-foreground">{item.variante}</p>
                    )}
                    <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant={item.isVerified ? "default" : "secondary"}>
                    {item.verifiedQuantity}/{item.totalQuantity}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
