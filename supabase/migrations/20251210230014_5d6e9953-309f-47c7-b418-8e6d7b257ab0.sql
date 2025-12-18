-- Add device_id column to picking_libre_sessions for multi-device support
ALTER TABLE picking_libre_sessions 
ADD COLUMN IF NOT EXISTS device_id TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN picking_libre_sessions.device_id IS 'Unique identifier for the device/browser that created/owns this session. Used to prevent conflicts when same user operates from multiple devices.';

-- Create index for efficient queries filtering by user and device
CREATE INDEX IF NOT EXISTS idx_picking_libre_sessions_user_device 
ON picking_libre_sessions(created_by, device_id, status);

-- Create index for active sessions lookup
CREATE INDEX IF NOT EXISTS idx_picking_libre_sessions_active
ON picking_libre_sessions(created_by, status) 
WHERE status NOT IN ('completado', 'cancelado');