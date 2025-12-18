-- Reemplazar las funciones anteriores con una función que maneja el escaneo completo

-- Eliminar funciones antiguas si existen
DROP FUNCTION IF EXISTS increment_picking_item_quantity(UUID, TEXT, TEXT);

-- Función para escanear producto (insert o increment) de manera atómica
CREATE OR REPLACE FUNCTION scan_product_atomic(
  p_session_id UUID,
  p_sku TEXT,
  p_bin_code TEXT,
  p_nombre_producto TEXT,
  p_variante TEXT,
  p_stock_id TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Intentar incrementar si existe
  UPDATE picking_libre_items
  SET quantity = quantity + 1,
      scanned_at = NOW()
  WHERE session_id = p_session_id
    AND sku = p_sku
    AND bin_code = p_bin_code;

  -- Si no existía, insertar
  IF NOT FOUND THEN
    INSERT INTO picking_libre_items (
      session_id,
      sku,
      bin_code,
      quantity,
      nombre_producto,
      variante,
      stock_id,
      scanned_at
    ) VALUES (
      p_session_id,
      p_sku,
      p_bin_code,
      1,
      p_nombre_producto,
      p_variante,
      p_stock_id,
      NOW()
    );
  END IF;
END;
$$;