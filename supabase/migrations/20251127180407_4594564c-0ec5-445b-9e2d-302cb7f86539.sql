-- Crear funciones para operaciones atómicas en picking_libre_items

-- Función para incrementar quantity de manera atómica
CREATE OR REPLACE FUNCTION increment_picking_item_quantity(
  p_session_id UUID,
  p_sku TEXT,
  p_bin_code TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE picking_libre_items
  SET quantity = quantity + 1
  WHERE session_id = p_session_id
    AND sku = p_sku
    AND bin_code = p_bin_code;
END;
$$;

-- Función para decrementar quantity de manera atómica (elimina si llega a 0)
CREATE OR REPLACE FUNCTION decrement_picking_item_quantity(
  p_session_id UUID,
  p_sku TEXT,
  p_bin_code TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_quantity INTEGER;
BEGIN
  -- Obtener cantidad actual
  SELECT quantity INTO v_current_quantity
  FROM picking_libre_items
  WHERE session_id = p_session_id
    AND sku = p_sku
    AND bin_code = p_bin_code;

  -- Si no existe, salir
  IF v_current_quantity IS NULL THEN
    RETURN;
  END IF;

  -- Si es 1, eliminar el registro
  IF v_current_quantity <= 1 THEN
    DELETE FROM picking_libre_items
    WHERE session_id = p_session_id
      AND sku = p_sku
      AND bin_code = p_bin_code;
  ELSE
    -- Si es mayor a 1, decrementar
    UPDATE picking_libre_items
    SET quantity = quantity - 1
    WHERE session_id = p_session_id
      AND sku = p_sku
      AND bin_code = p_bin_code;
  END IF;
END;
$$;