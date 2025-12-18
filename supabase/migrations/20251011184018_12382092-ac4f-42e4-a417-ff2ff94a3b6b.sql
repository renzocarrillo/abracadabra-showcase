-- PICKING LIBRE: Tablas, funciones y permisos

-- 1. Tabla para sesiones de picking libre
CREATE TABLE picking_libre_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES profiles(id) NOT NULL,
  created_by_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'en_proceso',
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  total_items INTEGER DEFAULT 0,
  tienda_destino_id UUID REFERENCES tiendas(id),
  documento_tipo TEXT,
  transportista_id UUID REFERENCES transportistas(id),
  url_public_view TEXT,
  bsale_response JSONB,
  notes TEXT
);

-- 2. Tabla para items escaneados
CREATE TABLE picking_libre_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES picking_libre_sessions(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  bin_code TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  scanned_at TIMESTAMPTZ DEFAULT now(),
  nombre_producto TEXT NOT NULL,
  variante TEXT,
  stock_id UUID REFERENCES stockxbin(id)
);

-- 3. Función de validación de disponibilidad
CREATE OR REPLACE FUNCTION validate_product_available(
  p_sku TEXT,
  p_bin_code TEXT,
  p_quantity INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stock_record RECORD;
BEGIN
  SELECT id, sku, bin, disponibles, comprometido, en_existencia
  INTO stock_record
  FROM stockxbin
  WHERE sku = p_sku 
    AND bin = p_bin_code
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'available', false,
      'error', 'no_stock_in_bin',
      'message', 'Producto no encontrado en este bin'
    );
  END IF;
  
  IF stock_record.disponibles < p_quantity THEN
    RETURN jsonb_build_object(
      'available', false,
      'error', 'insufficient_stock',
      'message', 'Stock insuficiente disponible',
      'disponibles', stock_record.disponibles,
      'comprometido', stock_record.comprometido,
      'solicitado', p_quantity
    );
  END IF;
  
  RETURN jsonb_build_object(
    'available', true,
    'stock_id', stock_record.id,
    'disponibles', stock_record.disponibles,
    'comprometido', stock_record.comprometido,
    'en_existencia', stock_record.en_existencia
  );
END;
$$;

-- 4. Función para completar picking libre
CREATE OR REPLACE FUNCTION complete_picking_libre(
  p_session_id UUID,
  p_tienda_id UUID,
  p_documento_tipo TEXT,
  p_transportista_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_record RECORD;
  item_record RECORD;
BEGIN
  SELECT * INTO session_record
  FROM picking_libre_sessions
  WHERE id = p_session_id AND status = 'en_proceso';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Sesión no encontrada o ya completada'
    );
  END IF;
  
  IF session_record.total_items = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No hay productos en la sesión'
    );
  END IF;
  
  UPDATE picking_libre_sessions
  SET 
    status = 'completado',
    completed_at = now(),
    tienda_destino_id = p_tienda_id,
    documento_tipo = p_documento_tipo,
    transportista_id = p_transportista_id
  WHERE id = p_session_id;
  
  FOR item_record IN 
    SELECT * FROM picking_libre_items WHERE session_id = p_session_id
  LOOP
    UPDATE stockxbin
    SET 
      disponibles = disponibles - item_record.quantity,
      en_existencia = en_existencia - item_record.quantity,
      updated_at = now()
    WHERE id = item_record.stock_id;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'message', 'Sesión completada correctamente'
  );
END;
$$;

-- 5. Insertar permiso
INSERT INTO permissions (name, display_name, description, category)
VALUES (
  'free_picking',
  'Picking Libre',
  'Permite realizar picking manual sin pedidos asignados y crear traslados directos',
  'picking'
);

-- 6. RLS Policies para picking_libre_sessions
ALTER TABLE picking_libre_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users with free_picking can manage sessions"
ON picking_libre_sessions FOR ALL
USING (
  user_has_role('admin'::text) OR 
  user_has_permission('free_picking'::text) OR
  auth.uid() = created_by
)
WITH CHECK (
  user_has_role('admin'::text) OR 
  user_has_permission('free_picking'::text)
);

-- 7. RLS Policies para picking_libre_items
ALTER TABLE picking_libre_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read items from their sessions"
ON picking_libre_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM picking_libre_sessions
    WHERE id = session_id 
    AND (created_by = auth.uid() OR user_has_permission('free_picking'::text))
  )
);

CREATE POLICY "Users can insert items to their sessions"
ON picking_libre_items FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM picking_libre_sessions
    WHERE id = session_id 
    AND created_by = auth.uid()
    AND status = 'en_proceso'
  )
);