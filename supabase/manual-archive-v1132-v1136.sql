-- Script para archivar manualmente V1132, V1133, V1135, V1136
-- Ejecutar en el SQL Editor de Supabase

-- Paso 1: Eliminar asignaciones (si existen)
DELETE FROM ventas_asignaciones 
WHERE venta_id IN (
  SELECT id FROM ventas WHERE venta_id IN ('V1136', 'V1135', 'V1133', 'V1132')
);

-- Paso 2: Actualizar estado a archivado
UPDATE ventas 
SET 
  estado = 'archivado',
  updated_at = NOW()
WHERE venta_id IN ('V1136', 'V1135', 'V1133', 'V1132');

-- Paso 3: Registrar en audit log
INSERT INTO ventas_audit_log (venta_id, venta_codigo, accion, estado_anterior, estado_nuevo, usuario_id, usuario_nombre, detalles)
SELECT 
  id,
  venta_id,
  'ARCHIVADO_MANUAL',
  'documento_emitido',
  'archivado',
  NULL,
  'Sistema - Archivado Manual',
  jsonb_build_object(
    'motivo', 'Archivado manual - Stock ya liberado manualmente',
    'acciones_realizadas', jsonb_build_array(
      'Asignaciones eliminadas',
      'Venta archivada',
      'Stock NO tocado (ya fue liberado manualmente)'
    ),
    'timestamp', NOW()
  )
FROM ventas 
WHERE venta_id IN ('V1136', 'V1135', 'V1133', 'V1132');

-- Verificar resultados
SELECT venta_id, estado, updated_at 
FROM ventas 
WHERE venta_id IN ('V1136', 'V1135', 'V1133', 'V1132')
ORDER BY venta_id;
