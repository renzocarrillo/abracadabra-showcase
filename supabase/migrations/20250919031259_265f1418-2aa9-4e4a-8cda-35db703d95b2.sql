-- Marcar pedido T1007 como archivado y liberar stock
-- Primero liberar el stock comprometido de vuelta a disponible
UPDATE stockxbin 
SET 
    disponibles = disponibles + pa.cantidad_asignada,
    comprometido = comprometido - pa.cantidad_asignada,
    updated_at = now()
FROM pedidos_asignaciones pa
JOIN pedidos p ON pa.pedido_id = p.id
WHERE p.pedido_id = 'T1007' 
  AND pa.stock_id = stockxbin.id;

-- Eliminar las asignaciones del pedido
DELETE FROM pedidos_asignaciones 
WHERE pedido_id = (SELECT id FROM pedidos WHERE pedido_id = 'T1007');

-- Marcar el pedido como archivado
UPDATE pedidos 
SET 
    estado = 'archivado',
    updated_at = now()
WHERE pedido_id = 'T1007';

-- Registrar en el audit log
INSERT INTO pedidos_audit_log (
    pedido_id,
    pedido_codigo,
    accion,
    estado_anterior,
    estado_nuevo,
    usuario_id,
    usuario_nombre,
    detalles
) 
SELECT 
    p.id,
    p.pedido_id,
    'manual_archivado',
    'procesado',
    'archivado',
    '499355af-5f22-4802-9e70-a3caaaf73b64'::uuid, -- Tu user ID
    'Sistema (manual)',
    jsonb_build_object(
        'motivo', 'Archivado manualmente después de emisión incorrecta',
        'timestamp', now()
    )
FROM pedidos p 
WHERE p.pedido_id = 'T1007';