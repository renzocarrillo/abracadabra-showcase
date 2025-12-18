-- Eliminar la función scan_product_atomic con firma TEXT
DROP FUNCTION IF EXISTS scan_product_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT);

-- Recrear la función con la firma correcta (p_stock_id UUID)
CREATE OR REPLACE FUNCTION scan_product_atomic(
  p_session_id UUID,
  p_sku TEXT,
  p_bin_code TEXT,
  p_nombre_producto TEXT,
  p_variante TEXT,
  p_stock_id UUID
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