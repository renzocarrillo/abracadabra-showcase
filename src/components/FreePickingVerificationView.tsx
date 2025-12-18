import { CheckCircle2, Circle, Package } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { FreeVerificationItem } from '@/hooks/useFreePickingSession';

interface FreePickingVerificationViewProps {
  verificationItems: FreeVerificationItem[];
  onScan: (code: string) => void;
  isCompleted?: boolean;
}

export function FreePickingVerificationView({ verificationItems, onScan, isCompleted = false }: FreePickingVerificationViewProps) {
  const totalItems = verificationItems.length;
  const verifiedItems = verificationItems.filter(item => item.isVerified).length;
  const progress = totalItems > 0 ? (verifiedItems / totalItems) * 100 : 0;

  const totalQuantity = verificationItems.reduce((sum, item) => sum + item.totalQuantity, 0);
  const verifiedQuantity = verificationItems.reduce((sum, item) => sum + item.verifiedQuantity, 0);

  return (
    <div className="space-y-4 md:space-y-6">
      <Card className="p-4 md:p-6 bg-card border-border">
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h3 className="text-base md:text-lg font-semibold text-foreground">Verificación de Productos</h3>
              <p className="text-xs md:text-sm text-muted-foreground">
                Escanea cada producto para verificar el conteo
              </p>
            </div>
            <Badge variant={progress === 100 ? "default" : "secondary"} className="text-sm md:text-lg px-3 md:px-4 py-1 md:py-2 w-fit">
              {verifiedItems}/{totalItems} productos
            </Badge>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progreso total</span>
              <span className="font-medium text-foreground">
                {verifiedQuantity}/{totalQuantity} unidades
              </span>
            </div>
            <Progress value={progress} className="h-3" />
          </div>
        </div>
      </Card>

      <Card className="p-4 md:p-6 bg-card border-border">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary flex-shrink-0" />
            <h3 className="font-medium text-foreground text-sm md:text-base">Escanear para Verificar</h3>
          </div>

          <BarcodeScanner
            onScan={onScan}
            placeholder={isCompleted ? "Verificación completada" : "Escanea el código del producto..."}
            disabled={isCompleted}
          />
        </div>
      </Card>

      <Card className="p-4 md:p-6 bg-card border-border">
        <h3 className="font-medium mb-4 text-foreground text-sm md:text-base">Lista de Productos</h3>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {verificationItems.map((item) => {
            const Icon = item.isVerified ? CheckCircle2 : Circle;
            const iconColor = item.isVerified ? 'text-primary' : 'text-muted-foreground';
            
            return (
              <div
                key={item.sku}
                className={`flex items-center justify-between p-3 md:p-4 rounded-lg border transition-colors gap-3 ${
                  item.isVerified 
                    ? 'bg-primary/5 border-primary/20' 
                    : 'bg-muted border-border'
                }`}
              >
                <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                  <Icon className={`h-5 w-5 ${iconColor} flex-shrink-0`} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground truncate text-sm md:text-base">{item.productName}</p>
                    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1 sm:gap-2 mt-1">
                      <p className="text-xs md:text-sm text-muted-foreground break-all">SKU: {item.sku}</p>
                      {item.variante && (
                        <p className="text-xs md:text-sm text-muted-foreground">• {item.variante}</p>
                      )}
                      <p className="text-xs md:text-sm text-muted-foreground break-words">
                        • Bins: {item.bins.join(', ')}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`text-base md:text-lg font-bold ${
                    item.isVerified ? 'text-primary' : 'text-foreground'
                  }`}>
                    {item.verifiedQuantity}/{item.totalQuantity}
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {item.isVerified ? 'Completo' : 'Pendiente'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
