
-- Drop the old unsafe RPC that consumed stock immediately
DROP FUNCTION IF EXISTS complete_picking_libre(uuid, uuid, text, uuid);

-- Add comment to the safe version
COMMENT ON FUNCTION complete_picking_libre_safe IS 'Safe version that marks session as completed WITHOUT consuming stock. Stock will be consumed by edge functions AFTER Bsale confirmation.';
COMMENT ON FUNCTION consume_picking_libre_stock IS 'Consumes stock AFTER successful document emission to Bsale. Called by edge functions only.';
COMMENT ON FUNCTION restore_lost_stock IS 'Restores stock that was lost due to failed document emissions. Use for manual recovery only.';
