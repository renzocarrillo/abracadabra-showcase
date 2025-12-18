import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertTriangle, Search, Package } from "lucide-react";
import { AlternativeBinsDisplay } from "./AlternativeBinsDisplay";

interface ProductIssue {
  sku: string;
  productName: string;
  binCode: string;
  expectedQuantity: number;
  detalleId: string;
}

interface AlternativeBin {
  bin_code: string;
  available_quantity: number;
  stock_id: string;
  is_frozen: boolean;
}

interface ProductIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issue: ProductIssue | null;
  onFindAlternatives: (sku: string, quantity: number, excludeBin: string) => Promise<AlternativeBin[]>;
  onConfirmReassignment: (
    foundQuantity: number,
    selectedBins: Array<{ bin: string; quantity: number }>
  ) => Promise<void>;
  onAdjustQuantity: (newQuantity: number, reason: string) => Promise<void>;
}

export function ProductIssueDialog({
  open,
  onOpenChange,
  issue,
  onFindAlternatives,
  onConfirmReassignment,
  onAdjustQuantity,
}: ProductIssueDialogProps) {
  const [issueType, setIssueType] = useState<"not_found" | "insufficient" | "other">("not_found");
  const [foundQuantity, setFoundQuantity] = useState(0);
  const [alternativeBins, setAlternativeBins] = useState<AlternativeBin[]>([]);
  const [selectedBins, setSelectedBins] = useState<Array<{ bin: string; quantity: number }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (open && issue) {
      // Reset state when dialog opens
      setIssueType("not_found");
      setFoundQuantity(0);
      setAlternativeBins([]);
      setSelectedBins([]);
    }
  }, [open, issue]);

  if (!issue) return null;

  const handleFindAlternatives = async () => {
    setIsSearching(true);
    try {
      const quantityNeeded = issueType === "not_found" 
        ? issue.expectedQuantity 
        : issue.expectedQuantity - foundQuantity;
      
      const bins = await onFindAlternatives(issue.sku, quantityNeeded, issue.binCode);
      setAlternativeBins(bins);
    } catch (error) {
      console.error("Error finding alternatives:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      const totalInAlternatives = selectedBins.reduce((sum, b) => sum + b.quantity, 0);
      const totalFound = foundQuantity + totalInAlternatives;

      if (totalFound < issue.expectedQuantity) {
        // Cantidad insuficiente, ajustar pedido
        await onAdjustQuantity(
          totalFound,
          `Stock insuficiente en almacén. Encontrado: ${totalFound} de ${issue.expectedQuantity}`
        );
      } else {
        // Reasignar a bins alternativos
        await onConfirmReassignment(foundQuantity, selectedBins);
      }
      
      onOpenChange(false);
    } catch (error) {
      console.error("Error confirming adjustment:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const totalInAlternatives = selectedBins.reduce((sum, b) => sum + b.quantity, 0);
  const totalAssigned = foundQuantity + totalInAlternatives;
  const stillMissing = issue.expectedQuantity - totalAssigned;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Reportar Problema con Producto
          </DialogTitle>
          <DialogDescription>
            {issue.productName} - SKU: {issue.sku}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Información del problema */}
          <div className="rounded-lg border p-4 bg-muted/50">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Bin actual:</span>
              <span className="font-semibold">{issue.binCode}</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-2">
              <span className="text-muted-foreground">Cantidad esperada:</span>
              <span className="font-semibold">{issue.expectedQuantity} unidades</span>
            </div>
          </div>

          {/* Tipo de problema */}
          <div className="space-y-3">
            <Label>¿Qué sucedió con el producto?</Label>
            <RadioGroup value={issueType} onValueChange={(v: any) => setIssueType(v)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="not_found" id="not_found" />
                <Label htmlFor="not_found" className="font-normal cursor-pointer">
                  No hay ninguno en este bin
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="insufficient" id="insufficient" />
                <Label htmlFor="insufficient" className="font-normal cursor-pointer">
                  Hay menos unidades de las esperadas
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Input de cantidad encontrada si es insuficiente */}
          {issueType === "insufficient" && (
            <div className="space-y-2">
              <Label htmlFor="found-quantity">¿Cuántas unidades encontraste?</Label>
              <Input
                id="found-quantity"
                type="number"
                min={0}
                max={issue.expectedQuantity - 1}
                value={foundQuantity}
                onChange={(e) => setFoundQuantity(parseInt(e.target.value) || 0)}
                placeholder="Cantidad encontrada"
              />
            </div>
          )}

          {/* Botón para buscar en otros bins */}
          {(issueType === "not_found" || (issueType === "insufficient" && foundQuantity > 0)) && (
            <Button
              onClick={handleFindAlternatives}
              disabled={isSearching}
              variant="outline"
              className="w-full"
            >
              <Search className="h-4 w-4 mr-2" />
              {isSearching ? "Buscando..." : "Buscar en otros bins"}
            </Button>
          )}

          {/* Mostrar bins alternativos */}
          {alternativeBins.length > 0 && (
            <AlternativeBinsDisplay
              alternativeBins={alternativeBins}
              quantityNeeded={issue.expectedQuantity - foundQuantity}
              selectedBins={selectedBins}
              onSelectionChange={setSelectedBins}
            />
          )}

          {/* Resumen de asignación */}
          {(foundQuantity > 0 || selectedBins.length > 0) && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Package className="h-4 w-4 text-primary" />
                <span className="font-medium">Resumen de Asignación</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Encontrado en {issue.binCode}:</span>
                  <span className="font-medium">{foundQuantity}</span>
                </div>
                {totalInAlternatives > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">En bins alternativos:</span>
                    <span className="font-medium">{totalInAlternatives}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t">
                  <span className="font-medium">Total asignado:</span>
                  <span className="font-bold">{totalAssigned}</span>
                </div>
                {stillMissing > 0 && (
                  <div className="flex justify-between text-warning">
                    <span className="font-medium">Faltante:</span>
                    <span className="font-bold">{stillMissing}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Advertencia si falta stock */}
          {stillMissing > 0 && alternativeBins.length === 0 && foundQuantity > 0 && (
            <div className="rounded-lg border border-warning/50 bg-warning/10 p-4">
              <p className="text-sm text-warning font-medium">
                ⚠️ No hay suficiente stock disponible en otros bins. El pedido se ajustará a {totalAssigned} unidades.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isProcessing || (issueType === "insufficient" && foundQuantity === 0)}
          >
            {isProcessing ? "Procesando..." : stillMissing > 0 ? "Ajustar Pedido" : "Confirmar Reasignación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
