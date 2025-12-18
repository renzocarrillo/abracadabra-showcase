import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, FileSignature, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface OrderSignatureBadgeProps {
  signature?: {
    signed_by_name: string;
    signed_at: string;
  };
  canSign: boolean;
  onSignClick: () => void;
  compact?: boolean;
}

export default function OrderSignatureBadge({
  signature,
  canSign,
  onSignClick,
  compact = false
}: OrderSignatureBadgeProps) {
  if (signature) {
    return (
      <Badge 
        variant="secondary" 
        className={cn(
          "bg-green-100 text-green-800 border-green-200",
          compact ? "text-xs" : ""
        )}
      >
        <CheckCircle className={cn("mr-1", compact ? "h-3 w-3" : "h-4 w-4")} />
        Firmado por {signature.signed_by_name.split(' ')[0]}
      </Badge>
    );
  }

  // Show unsigned status for everyone who can view, but only show sign button if they can sign
  return (
    <div className="flex items-center gap-2">
      <Badge 
        variant="outline" 
        className={cn(
          "border-amber-200 text-amber-700 bg-amber-50",
          compact ? "text-xs" : ""
        )}
      >
        <Clock className={cn("mr-1", compact ? "h-3 w-3" : "h-4 w-4")} />
        Sin firmar
      </Badge>
      {canSign && !compact && (
        <Button
          size="sm"
          variant="outline"
          onClick={onSignClick}
          className="h-7 px-2 text-xs"
        >
          <FileSignature className="h-3 w-3 mr-1" />
          Firmar
        </Button>
      )}
    </div>
  );
}