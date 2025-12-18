-- Crear tabla para auditoría de ajustes durante picking
CREATE TABLE IF NOT EXISTS picking_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID REFERENCES pedidos(id) ON DELETE CASCADE NOT NULL,
  pedido_detalle_id UUID REFERENCES pedidos_detalle(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  original_bin TEXT NOT NULL,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('not_found', 'insufficient', 'relocated')),
  expected_quantity INTEGER NOT NULL,
  found_quantity INTEGER NOT NULL,
  alternative_bins JSONB,
  adjusted_by UUID REFERENCES profiles(id),
  adjusted_by_name TEXT,
  adjusted_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para mejor performance
CREATE INDEX idx_picking_adjustments_pedido ON picking_adjustments(pedido_id);
CREATE INDEX idx_picking_adjustments_sku ON picking_adjustments(sku);
CREATE INDEX idx_picking_adjustments_type ON picking_adjustments(adjustment_type);

-- RLS Policies
ALTER TABLE picking_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized users can read picking adjustments"
ON picking_adjustments FOR SELECT
USING (
  user_has_role('admin'::text) OR 
  user_has_permission('adjust_picking'::text) OR
  user_has_permission('view_picking_details'::text) OR
  user_has_permission('view_orders'::text)
);

CREATE POLICY "Authorized users can insert picking adjustments"
ON picking_adjustments FOR INSERT
WITH CHECK (
  user_has_role('admin'::text) OR 
  user_has_permission('adjust_picking'::text)
);

-- Función para buscar bins alternativos
CREATE OR REPLACE FUNCTION find_alternative_bins(
  p_sku TEXT,
  p_quantity_needed INTEGER,
  p_exclude_bin TEXT DEFAULT NULL
) 
RETURNS TABLE (
  bin_code TEXT,
  available_quantity INTEGER,
  committed_quantity INTEGER,
  stock_id UUID,
  is_frozen BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.bin,
    s.disponibles,
    s.comprometido,
    s.id,
    COALESCE(b.is_frozen, false)
  FROM stockxbin s
  LEFT JOIN bins b ON s.bin = b.bin_code
  WHERE s.sku = p_sku 
    AND s.disponibles > 0
    AND (p_exclude_bin IS NULL OR s.bin != p_exclude_bin)
    AND (b.is_frozen IS NULL OR b.is_frozen = false)
  ORDER BY s.disponibles DESC;
END;
$$;

-- Función para reasignar durante picking
CREATE OR REPLACE FUNCTION reassign_during_picking(
  p_pedido_id UUID,
  p_detalle_id UUID,
  p_sku TEXT,
  p_original_bin TEXT,
  p_found_quantity INTEGER,
  p_new_bins JSONB,
  p_adjusted_by UUID,
  p_adjusted_by_name TEXT
) 
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  original_assignment RECORD;
  new_bin JSONB;
  result JSONB;
  total_reassigned INTEGER := 0;
  to_release INTEGER;
  new_bin_code TEXT;
  new_quantity INTEGER;
  stock_rec RECORD;
BEGIN
  -- Buscar la asignación original
  SELECT * INTO original_assignment
  FROM pedidos_asignaciones
  WHERE pedido_id = p_pedido_id
    AND pedido_detalle_id = p_detalle_id
    AND sku = p_sku
    AND bin = p_original_bin
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Asignación original no encontrada'
    );
  END IF;

  -- Calcular cantidad a liberar
  to_release := original_assignment.cantidad_asignada - p_found_quantity;

  -- Solo liberar si hay diferencia
  IF to_release > 0 THEN
    -- Liberar stock del bin original
    UPDATE stockxbin
    SET 
      disponibles = disponibles + to_release,
      comprometido = comprometido - to_release,
      updated_at = now()
    WHERE id = original_assignment.stock_id;

    -- Actualizar la asignación original
    UPDATE pedidos_asignaciones
    SET cantidad_asignada = p_found_quantity
    WHERE id = original_assignment.id;
  END IF;

  -- Crear nuevas asignaciones en bins alternativos
  FOR new_bin IN SELECT * FROM jsonb_array_elements(p_new_bins)
  LOOP
    new_bin_code := new_bin->>'bin';
    new_quantity := (new_bin->>'quantity')::INTEGER;

    -- Buscar stock en el nuevo bin
    SELECT * INTO stock_rec
    FROM stockxbin
    WHERE sku = p_sku AND bin = new_bin_code AND disponibles >= new_quantity
    LIMIT 1;

    IF FOUND THEN
      -- Crear nueva asignación
      INSERT INTO pedidos_asignaciones (
        pedido_id,
        pedido_detalle_id,
        sku,
        bin,
        cantidad_asignada,
        stock_id
      ) VALUES (
        p_pedido_id,
        p_detalle_id,
        p_sku,
        new_bin_code,
        new_quantity,
        stock_rec.id
      );

      -- Actualizar stock (disponible -> comprometido)
      UPDATE stockxbin
      SET 
        disponibles = disponibles - new_quantity,
        comprometido = comprometido + new_quantity,
        updated_at = now()
      WHERE id = stock_rec.id;

      total_reassigned := total_reassigned + new_quantity;
    END IF;
  END LOOP;

  -- Registrar ajuste para auditoría
  INSERT INTO picking_adjustments (
    pedido_id,
    pedido_detalle_id,
    sku,
    original_bin,
    adjustment_type,
    expected_quantity,
    found_quantity,
    alternative_bins,
    adjusted_by,
    adjusted_by_name
  ) VALUES (
    p_pedido_id,
    p_detalle_id,
    p_sku,
    p_original_bin,
    CASE 
      WHEN p_found_quantity = 0 THEN 'not_found'
      WHEN p_found_quantity < original_assignment.cantidad_asignada THEN 'insufficient'
      ELSE 'relocated'
    END,
    original_assignment.cantidad_asignada,
    p_found_quantity,
    p_new_bins,
    p_adjusted_by,
    p_adjusted_by_name
  );

  result := jsonb_build_object(
    'success', true,
    'original_quantity', original_assignment.cantidad_asignada,
    'found_quantity', p_found_quantity,
    'reassigned_quantity', total_reassigned,
    'total_assigned', p_found_quantity + total_reassigned
  );

  RETURN result;
END;
$$;

-- Función para ajustar cantidad del pedido
CREATE OR REPLACE FUNCTION adjust_order_quantity(
  p_detalle_id UUID,
  p_new_quantity INTEGER,
  p_reason TEXT
) 
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Actualizar cantidad solicitada en pedidos_detalle
  UPDATE pedidos_detalle
  SET 
    cantidad_solicitada = p_new_quantity,
    updated_at = now()
  WHERE id = p_detalle_id;

  RETURN jsonb_build_object(
    'success', true,
    'new_quantity', p_new_quantity,
    'reason', p_reason
  );
END;
$$;

-- Crear permiso para ajustar picking
INSERT INTO permissions (name, display_name, description, category)
VALUES (
  'adjust_picking',
  'Ajustar Picking',
  'Permite realizar ajustes durante el proceso de picking (reportar faltantes, reasignar bins)',
  'picking'
)
ON CONFLICT (name) DO NOTHING;