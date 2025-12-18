import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function MigrationModeBanner() {
  return (
    <Alert className="rounded-none border-x-0 border-t-0 bg-orange-500/10 border-orange-500/50">
      <AlertTriangle className="h-4 w-4 text-orange-500" />
      <AlertDescription className="text-orange-500 font-medium">
        MODO MIGRACIÓN ACTIVO - Las operaciones de stock NO se sincronizan con BSale
      </AlertDescription>
    </Alert>
  );
}
