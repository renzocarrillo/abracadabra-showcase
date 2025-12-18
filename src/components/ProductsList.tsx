import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, Package, ArrowRight, AlertTriangle } from 'lucide-react';
import { BinPickingItem } from '@/hooks/usePickingSession';

interface ProductsListProps {
  binCode: string;
  items: BinPickingItem[];
  onNextBin: () => void;
  canProceedToNext: boolean;
  onReportIssue?: (item: BinPickingItem) => void;
  flexibleMode?: boolean;
}

export function ProductsList({ 
  binCode, 
  items, 
  onNextBin, 
  canProceedToNext,
  onReportIssue,
  flexibleMode = false
}: ProductsListProps) {
  const scannedCount = items.filter(item => item.isScanned).length;
  const totalCount = items.length;

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-card border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">
              Productos en bin {binCode}
            </h3>
          </div>
          <Badge 
            variant={scannedCount === totalCount ? "default" : "secondary"}
            className="text-sm px-3 py-1"
          >
            {(() => {
              const totalNeeded = items.reduce((sum, item) => sum + item.cantidad, 0);
              const totalScanned = items.reduce((sum, item) => sum + item.scannedQuantity, 0);
              return `${totalScanned} / ${totalNeeded} unidades`;
            })()}
          </Badge>
        </div>

        <div className="space-y-3">
          {items.map((item) => (
            <div 
              key={item.id} 
              className={`flex items-center gap-4 p-3 rounded-lg border transition-colors ${
                item.isScanned 
                  ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' 
                  : 'bg-muted/50 border-border'
              }`}
            >
              <div className="flex-shrink-0">
                {item.isScanned ? (
                  <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full border-2 border-muted-foreground" />
                )}
              </div>
              
              <div className="flex-1">
                <div className="font-semibold text-foreground">
                  {item.nombre_producto}
                </div>
                <div className="text-sm text-muted-foreground">
                  {item.variante && `${item.variante} • `}SKU: {item.sku}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-sm">
                  ×{item.cantidad}
                </Badge>
                {item.scannedQuantity > 0 && (
                  <Badge 
                    className={`${
                      item.isScanned 
                        ? 'bg-green-100 text-green-800 border-0' 
                        : 'bg-yellow-100 text-yellow-800 border-0'
                    }`}
                  >
                    {item.scannedQuantity}/{item.cantidad}
                  </Badge>
                )}
                {item.isScanned ? (
                  <Badge className="bg-green-100 text-green-800 border-0">
                    Completo
                  </Badge>
                ) : flexibleMode && onReportIssue && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onReportIssue(item)}
                    className="gap-1 text-xs"
                  >
                    <AlertTriangle className="h-3 w-3" />
                    Reportar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {canProceedToNext && (
          <div className="mt-6 pt-4 border-t border-border">
            <Button 
              onClick={onNextBin}
              className="w-full"
              size="lg"
            >
              <ArrowRight className="w-4 h-4 mr-2" />
              Siguiente Bin
            </Button>
          </div>
        )}
      </Card>

      {!canProceedToNext && scannedCount < totalCount && (
        <Card className="p-4 bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800">
          <div className="text-center text-blue-800 dark:text-blue-200">
            <Package className="w-6 h-6 mx-auto mb-2" />
            <div className="font-medium">
              Escanee el código del siguiente producto
            </div>
            <div className="text-sm text-blue-700 dark:text-blue-300 mt-1">
              {(() => {
                const totalNeeded = items.reduce((sum, item) => sum + item.cantidad, 0);
                const totalScanned = items.reduce((sum, item) => sum + item.scannedQuantity, 0);
                const remaining = totalNeeded - totalScanned;
                return `Faltan ${remaining} unidad${remaining !== 1 ? 'es' : ''} por escanear`;
              })()}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}