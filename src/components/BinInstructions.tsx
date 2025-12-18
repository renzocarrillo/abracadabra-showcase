import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, Scan } from 'lucide-react';

interface BinInstructionsProps {
  binCode: string;
  currentIndex: number;
  totalBins: number;
  itemCount: number;
}

export function BinInstructions({ binCode, currentIndex, totalBins, itemCount }: BinInstructionsProps) {
  return (
    <Card className="p-4 md:p-6 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
      <div className="text-center space-y-3 md:space-y-4">
        <div className="flex items-center justify-center gap-2">
          <Scan className="w-6 h-6 md:w-8 md:h-8 text-primary" />
          <Badge variant="outline" className="text-sm md:text-lg px-3 md:px-4 py-1 md:py-2">
            Bin {currentIndex + 1} de {totalBins}
          </Badge>
        </div>
        
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-foreground mb-2">
            Escanee el código del bin
          </h2>
          <div className="text-2xl md:text-4xl font-mono font-bold text-primary mb-4 break-all">
            {binCode}
          </div>
        </div>
        
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Package className="w-4 h-4" />
          <span className="text-xs md:text-sm">
            {itemCount} producto{itemCount !== 1 ? 's' : ''} en este bin
          </span>
        </div>
        
        <div className="text-xs md:text-sm text-muted-foreground px-4">
          Posicione el lector sobre el código de barras del bin y presione el gatillo
        </div>
      </div>
    </Card>
  );
}