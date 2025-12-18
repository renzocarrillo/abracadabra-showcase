import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Package } from "lucide-react";

interface ProductIssue {
  sku: string;
  productName: string;
  binCode: string;
  issueType: "not_found" | "insufficient" | "relocated";
  expectedQuantity: number;
  foundQuantity: number;
  alternativeBins: Array<{ bin: string; quantity: number }>;
  resolved: boolean;
}

interface PickingAdjustmentsSummaryProps {
  issues: ProductIssue[];
}

export function PickingAdjustmentsSummary({ issues }: PickingAdjustmentsSummaryProps) {
  if (issues.length === 0) return null;

  const resolvedCount = issues.filter((i) => i.resolved).length;
  const pendingCount = issues.length - resolvedCount;

  const getIssueTypeLabel = (type: string) => {
    switch (type) {
      case "not_found":
        return "No encontrado";
      case "insufficient":
        return "Cantidad insuficiente";
      case "relocated":
        return "Reubicado";
      default:
        return type;
    }
  };

  const getIssueTypeVariant = (type: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (type) {
      case "not_found":
        return "destructive";
      case "insufficient":
        return "secondary";
      case "relocated":
        return "default";
      default:
        return "outline";
    }
  };

  return (
    <Card className="border-warning/50 bg-warning/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-5 w-5 text-warning" />
          Ajustes Realizados Durante el Picking
          <Badge variant="secondary" className="ml-auto">
            {issues.length} {issues.length === 1 ? "ajuste" : "ajustes"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Resumen rápido */}
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span className="text-muted-foreground">Resueltos:</span>
            <span className="font-semibold">{resolvedCount}</span>
          </div>
          {pendingCount > 0 && (
            <div className="flex items-center gap-1">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <span className="text-muted-foreground">Pendientes:</span>
              <span className="font-semibold">{pendingCount}</span>
            </div>
          )}
        </div>

        {/* Lista de issues */}
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {issues.map((issue, index) => (
            <div
              key={index}
              className="rounded-lg border bg-background p-3 text-sm space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{issue.productName}</div>
                  <div className="text-muted-foreground text-xs">SKU: {issue.sku}</div>
                </div>
                <Badge variant={getIssueTypeVariant(issue.issueType)} className="flex-shrink-0">
                  {getIssueTypeLabel(issue.issueType)}
                </Badge>
              </div>

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div>
                  <span className="font-medium">Bin original:</span> {issue.binCode}
                </div>
                <div>
                  <span className="font-medium">Esperado:</span> {issue.expectedQuantity}
                </div>
                <div>
                  <span className="font-medium">Encontrado:</span> {issue.foundQuantity}
                </div>
              </div>

              {issue.alternativeBins && issue.alternativeBins.length > 0 && (
                <div className="pt-2 border-t">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    <Package className="h-3 w-3" />
                    <span>Bins alternativos:</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {issue.alternativeBins.map((alt, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {alt.bin} ({alt.quantity})
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {issue.resolved && (
                <div className="flex items-center gap-1 text-xs text-success">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>Resuelto</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
