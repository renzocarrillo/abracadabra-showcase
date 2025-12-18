import { supabase } from "@/integrations/supabase/client";
import { BinPickingItem } from "@/hooks/usePickingSession";

interface AlternativeBin {
  bin_code: string;
  available_quantity: number;
  stock_id: string;
  is_frozen: boolean;
}

export async function findAlternativeBins(
  sku: string,
  quantityNeeded: number,
  excludeBin: string
): Promise<AlternativeBin[]> {
  const { data, error } = await supabase.rpc('find_alternative_bins', {
    p_sku: sku,
    p_quantity_needed: quantityNeeded,
    p_exclude_bin: excludeBin
  });

  if (error) {
    console.error("Error finding alternative bins:", error);
    throw error;
  }

  return data || [];
}

export async function reassignDuringPicking(
  orderId: string,
  detalleId: string,
  sku: string,
  originalBin: string,
  foundQuantity: number,
  newBins: Array<{ bin: string; quantity: number }>,
  userId: string,
  userName: string
): Promise<any> {
  const { data, error } = await supabase.rpc('reassign_during_picking', {
    p_pedido_id: orderId,
    p_detalle_id: detalleId,
    p_sku: sku,
    p_original_bin: originalBin,
    p_found_quantity: foundQuantity,
    p_new_bins: newBins,
    p_adjusted_by: userId,
    p_adjusted_by_name: userName
  });

  if (error) {
    console.error("Error reassigning product:", error);
    throw error;
  }

  return data;
}

export async function adjustOrderQuantity(
  detalleId: string,
  newQuantity: number,
  reason: string
): Promise<any> {
  const { data, error } = await supabase.rpc('adjust_order_quantity', {
    p_detalle_id: detalleId,
    p_new_quantity: newQuantity,
    p_reason: reason
  });

  if (error) {
    console.error("Error adjusting order quantity:", error);
    throw error;
  }

  return data;
}

export function handleReportIssue(
  item: BinPickingItem,
  currentBinCode: string,
  setCurrentIssue: (issue: any) => void,
  setShowIssueDialog: (show: boolean) => void
) {
  setCurrentIssue({
    sku: item.sku,
    productName: item.nombre_producto,
    binCode: currentBinCode,
    expectedQuantity: item.cantidad,
    detalleId: item.id,
  });
  setShowIssueDialog(true);
}
