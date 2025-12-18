-- Add 'archivado' value to the venta_estado enum
ALTER TYPE venta_estado ADD VALUE IF NOT EXISTS 'archivado';