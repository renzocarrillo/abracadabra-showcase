-- Corrección manual para el pedido T1011: crear registro de traslado interno faltante
-- El pedido tuvo su guía emitida correctamente (#128) pero no se actualizó la base de datos local

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
  '1882acfe-e8a5-4ad6-89ff-be0f4c170126', -- pedido T1011 UUID
  'a6d02322-83cb-46ae-8c3e-879a8e40142c', -- tienda RLIMA UUID
  128, -- número de guía del audit log
  EXTRACT(EPOCH FROM '2025-09-18 22:17:29.402000-05'::timestamp)::integer, -- fecha de emisión
  17, -- office_id del almacén central
  '8', -- officeid de destino (Huancayo/Innovation)
  'Innovacion Textil S.A.C.', -- recipient
  'CAL.REAL NRO. 593 (ESQUINA DE CALLE REAL Y JIRON LIMA)', -- address del destino
  'Huancayo', -- city del destino
  'Huancayo', -- district del destino
  4, -- total_items (2 + 2 de las asignaciones)
  'https://app2.bsale.com.pe/view/85427/6f4c0cb45469?sfd=99', -- URL de la guía
  jsonb_build_object(
    'guideNumber', 128,
    'shippingId', 92974,
    'correctionNote', 'Registro creado manualmente - guía ya emitida correctamente en BSale'
  ),
  '2025-09-18 22:17:29.402000-05'::timestamp, -- created_at basado en logs
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
  (SELECT id FROM traslados_internos WHERE document_number = 128 AND pedido_id = '1882acfe-e8a5-4ad6-89ff-be0f4c170126'),
  pa.sku,
  pa.cantidad_asignada,
  COALESCE(v.costo, 0), -- usar costo de variants o 0 por defecto
  now(),
  now()
FROM pedidos_asignaciones pa
LEFT JOIN variants v ON pa.sku = v.sku
WHERE pa.pedido_id = '1882acfe-e8a5-4ad6-89ff-be0f4c170126';

-- 3. Limpiar las asignaciones activas (el stock ya fue consumido correctamente)
DELETE FROM public.pedidos_asignaciones 
WHERE pedido_id = '1882acfe-e8a5-4ad6-89ff-be0f4c170126';

-- 4. Archivar el pedido
UPDATE public.pedidos 
SET 
  estado = 'archivado',
  updated_at = now()
WHERE id = '1882acfe-e8a5-4ad6-89ff-be0f4c170126';

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
  '1882acfe-e8a5-4ad6-89ff-be0f4c170126',
  'T1011',
  'correccion_manual',
  'activo',
  'archivado', 
  'Sistema',
  jsonb_build_object(
    'motivo', 'Corrección manual: guía #128 emitida correctamente pero estado no actualizado',
    'documento_numero', 128,
    'fecha_correccion', now(),
    'stock_nota', 'Stock ya consumido correctamente por la función de emisión de guía',
    'url_guia', 'https://app2.bsale.com.pe/view/85427/6f4c0cb45469?sfd=99'
  )
);