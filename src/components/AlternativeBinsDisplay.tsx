import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Package, MapPin } from "lucide-react";

interface AlternativeBin {
  bin_code: string;
  available_quantity: number;
  stock_id: string;
  is_frozen: boolean;
}

interface AlternativeBinsDisplayProps {
  alternativeBins: AlternativeBin[];
  quantityNeeded: number;
  selectedBins: Array<{ bin: string; quantity: number }>;
  onSelectionChange: (bins: Array<{ bin: string; quantity: number }>) => void;
}

export function AlternativeBinsDisplay({
  alternativeBins,
  quantityNeeded,
  selectedBins,
  onSelectionChange,
}: AlternativeBinsDisplayProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const handleCheckChange = (binCode: string, checked: boolean, maxQuantity: number) => {
    if (checked) {
      // Calcular cuánto necesitamos todavía
      const currentTotal = selectedBins.reduce((sum, b) => sum + b.quantity, 0);
      const stillNeeded = Math.max(0, quantityNeeded - currentTotal);
      const defaultQuantity = Math.min(stillNeeded, maxQuantity);

      setQuantities((prev) => ({ ...prev, [binCode]: defaultQuantity }));
      onSelectionChange([...selectedBins, { bin: binCode, quantity: defaultQuantity }]);
    } else {
      const newQuantities = { ...quantities };
      delete newQuantities[binCode];
      setQuantities(newQuantities);
      onSelectionChange(selectedBins.filter((b) => b.bin !== binCode));
    }
  };

  const handleQuantityChange = (binCode: string, value: number, maxQuantity: number) => {
    const clampedValue = Math.min(Math.max(1, value), maxQuantity);
    setQuantities((prev) => ({ ...prev, [binCode]: clampedValue }));
    onSelectionChange(
      selectedBins.map((b) => (b.bin === binCode ? { ...b, quantity: clampedValue } : b))
    );
  };

  const totalSelected = selectedBins.reduce((sum, b) => sum + b.quantity, 0);
  const isFullyCovered = totalSelected >= quantityNeeded;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">Bins Alternativos Disponibles</Label>
        <Badge variant={isFullyCovered ? "default" : "secondary"}>
          {totalSelected} / {quantityNeeded} seleccionadas
        </Badge>
      </div>

      {alternativeBins.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No se encontraron bins alternativos con stock disponible</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {alternativeBins.map((bin) => {
            const isSelected = selectedBins.some((b) => b.bin === bin.bin_code);
            const currentQuantity = quantities[bin.bin_code] || 0;

            return (
              <div
                key={bin.bin_code}
                className={`flex items-center gap-4 p-3 rounded-lg border transition-colors ${
                  isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                }`}
              >
                <Checkbox
                  id={`bin-${bin.bin_code}`}
                  checked={isSelected}
                  onCheckedChange={(checked) =>
                    handleCheckChange(bin.bin_code, checked as boolean, bin.available_quantity)
                  }
                  disabled={bin.is_frozen}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <Label
                      htmlFor={`bin-${bin.bin_code}`}
                      className="font-semibold cursor-pointer"
                    >
                      {bin.bin_code}
                    </Label>
                    {bin.is_frozen && (
                      <Badge variant="destructive" className="text-xs">
                        Congelado
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Disponibles: {bin.available_quantity} unidades
                  </p>
                </div>

                {isSelected && (
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`qty-${bin.bin_code}`} className="text-sm whitespace-nowrap">
                      Cantidad:
                    </Label>
                    <Input
                      id={`qty-${bin.bin_code}`}
                      type="number"
                      min={1}
                      max={bin.available_quantity}
                      value={currentQuantity}
                      onChange={(e) =>
                        handleQuantityChange(
                          bin.bin_code,
                          parseInt(e.target.value) || 1,
                          bin.available_quantity
                        )
                      }
                      className="w-20"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {totalSelected > quantityNeeded && (
        <div className="rounded-lg border border-warning/50 bg-warning/10 p-3">
          <p className="text-sm text-warning">
            ⚠️ Has seleccionado más unidades de las necesarias ({totalSelected} de {quantityNeeded}).
          </p>
        </div>
      )}
    </div>
  );
}
