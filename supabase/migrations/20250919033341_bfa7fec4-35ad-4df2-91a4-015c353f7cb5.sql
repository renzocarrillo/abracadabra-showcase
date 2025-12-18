-- Corrección manual para el pedido T1009: crear registro de traslado interno faltante
-- El pedido tuvo su guía emitida correctamente pero no se actualizó la base de datos local

-- 1. Crear el registro faltante en traslados_internos
INSERT INTO public.traslados_internos (
  pedido_id,
  tienda_id,
  document_number,
  emission_date,
  office_id,
  destination_office_id,
  recipient,
  address,
  city,
  district,
  total_items,
  url_public_view,
  bsale_response,
  created_at,
  updated_at
) VALUES (
  '355c0861-bdf5-472a-97e9-2b16d81fdc64', -- pedido T1009 UUID
  'a6d02322-83cb-46ae-8c3e-879a8e40142c', -- tienda RLIMA UUID  
  127, -- número de guía del audit log
  EXTRACT(EPOCH FROM '2025-09-18 22:15:39.264208-05'::timestamp)::integer, -- fecha de emisión
  17, -- office_id del almacén central
  '8', -- officeid de RLIMA
  'RLIMA', -- recipient
  'Prol. Lucanas 1043', -- address por defecto
  'Lima', -- city por defecto
  'Lima', -- district por defecto
  3, -- total_items (1 + 2 de las asignaciones)
  'https://app2.bsale.com.pe/view/85427/b7a33e0a65b9?sfd=99', -- URL de la guía
  jsonb_build_object(
    'guideNumber', 127,
    'shippingId', 92972,
    'correctionNote', 'Registro creado manualmente - guía ya emitida correctamente'
  ),
  '2025-09-18 22:15:39.264208-05'::timestamp, -- created_at del audit log
  now() -- updated_at actual
);

-- 2. Crear detalles del traslado interno basados en las asignaciones
INSERT INTO public.traslados_internos_detalle (
  traslado_id,
  sku,
  quantity,
  net_unit_value,
  created_at,
  updated_at
)
SELECT 
  (SELECT id FROM traslados_internos WHERE document_number = 127 AND pedido_id = '355c0861-bdf5-472a-97e9-2b16d81fdc64'),
  pa.sku,
  pa.cantidad_asignada,
  COALESCE(v.costo, 0), -- usar costo de variants o 0 por defecto
  now(),
  now()
FROM pedidos_asignaciones pa
LEFT JOIN variants v ON pa.sku = v.sku
WHERE pa.pedido_id = '355c0861-bdf5-472a-97e9-2b16d81fdc64';

-- 3. Limpiar las asignaciones activas (el stock ya fue consumido correctamente)
DELETE FROM public.pedidos_asignaciones 
WHERE pedido_id = '355c0861-bdf5-472a-97e9-2b16d81fdc64';

-- 4. Archivar el pedido
UPDATE public.pedidos 
SET 
  estado = 'archivado',
  updated_at = now()
WHERE id = '355c0861-bdf5-472a-97e9-2b16d81fdc64';

-- 5. Agregar audit log de la corrección manual
INSERT INTO public.pedidos_audit_log (
  pedido_id,
  pedido_codigo,
  accion,
  estado_anterior,
  estado_nuevo,
  usuario_nombre,
  detalles
) VALUES (
  '355c0861-bdf5-472a-97e9-2b16d81fdc64',
  'T1009',
  'correccion_manual',
  'procesado',
  'archivado', 
  'Sistema',
  jsonb_build_object(
    'motivo', 'Corrección manual: guía emitida correctamente pero estado no actualizado',
    'documento_numero', 127,
    'fecha_correccion', now(),
    'stock_nota', 'Stock ya consumido correctamente por la función de emisión de guía'
  )
);