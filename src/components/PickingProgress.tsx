import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Check, Clock, Package } from 'lucide-react';
import { BinPickingData } from '@/hooks/usePickingSession';

interface PickingProgressProps {
  bins: BinPickingData[];
  currentBinIndex: number;
  completedBins: number;
  totalBins: number;
  percentage: number;
}

export function PickingProgress({ 
  bins, 
  currentBinIndex, 
  completedBins, 
  totalBins, 
  percentage 
}: PickingProgressProps) {
  return (
    <Card className="p-4 bg-card border-border">
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-foreground">Progreso del Picking</h3>
            <Badge variant="outline">
              {completedBins} / {totalBins}
            </Badge>
          </div>
          <Progress value={percentage} className="h-2" />
          <div className="text-xs text-muted-foreground text-center mt-1">
            {percentage}% completado
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground mb-3">Bins</div>
          {bins.map((bin, index) => (
            <div key={bin.binCode} className="flex items-center gap-3 p-2 rounded-md">
              <div className="flex-shrink-0">
                {bin.isCompleted ? (
                  <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                ) : index === currentBinIndex ? (
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <Clock className="w-3 h-3 text-primary-foreground" />
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-muted-foreground" />
                )}
              </div>
              
              <div className="flex-1">
                <div className="font-medium text-sm text-foreground">
                  {bin.binCode}
                </div>
                <div className="text-xs text-muted-foreground">
                  {(() => {
                    const totalNeeded = bin.items.reduce((sum, item) => sum + item.cantidad, 0);
                    const totalScanned = bin.items.reduce((sum, item) => sum + item.scannedQuantity, 0);
                    return `${totalScanned}/${totalNeeded} unidades`;
                  })()}
                </div>
              </div>
              
              <div>
                {bin.isCompleted ? (
                  <Badge className="bg-green-100 text-green-800 border-0 text-xs">
                    Completado
                  </Badge>
                ) : index === currentBinIndex ? (
                  <Badge className="bg-primary/10 text-primary border-primary text-xs">
                    Actual
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    Pendiente
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="pt-2 border-t border-border">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Package className="w-4 h-4" />
            <span>
              Total unidades: {bins.reduce((acc, bin) => 
                acc + bin.items.reduce((sum, item) => sum + item.cantidad, 0), 0
              )}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}