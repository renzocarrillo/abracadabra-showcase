
-- RPC para validar disponibilidad de productos en picking libre
-- Valida que NO se exceda el stock disponible considerando lo ya escaneado
CREATE OR REPLACE FUNCTION validate_product_available(
  p_sku text,
  p_bin_code text,
  p_quantity integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  stock_record RECORD;
  already_scanned INTEGER := 0;
  available_to_scan INTEGER;
BEGIN
  -- Get current stock for this SKU in this bin
  SELECT id, sku, bin, disponibles, comprometido
  INTO stock_record
  FROM stockxbin
  WHERE sku = p_sku AND bin = p_bin_code;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'available', false,
      'message', 'Producto no encontrado en este bin',
      'stock_id', null
    );
  END IF;
  
  -- Check if bin is frozen
  IF EXISTS (SELECT 1 FROM bins WHERE bin_code = p_bin_code AND is_frozen = true) THEN
    RETURN jsonb_build_object(
      'available', false,
      'message', 'Este bin está congelado por inventario',
      'stock_id', null
    );
  END IF;
  
  -- Calculate how many units of this SKU have already been scanned from this bin
  -- in active picking libre sessions
  SELECT COALESCE(SUM(quantity), 0)
  INTO already_scanned
  FROM picking_libre_items pli
  JOIN picking_libre_sessions pls ON pli.session_id = pls.id
  WHERE pli.sku = p_sku 
    AND pli.bin_code = p_bin_code
    AND pls.status = 'en_proceso';
  
  -- Calculate available quantity considering what's already scanned
  available_to_scan := stock_record.disponibles - already_scanned;
  
  IF available_to_scan < p_quantity THEN
    RETURN jsonb_build_object(
      'available', false,
      'message', format('Stock insuficiente. Disponible: %s, Ya escaneado: %s, En bin: %s', 
                       available_to_scan, already_scanned, stock_record.disponibles),
      'stock_id', stock_record.id,
      'disponibles', stock_record.disponibles,
      'already_scanned', already_scanned,
      'available_to_scan', available_to_scan
    );
  END IF;
  
  RETURN jsonb_build_object(
    'available', true,
    'message', 'Producto disponible',
    'stock_id', stock_record.id,
    'disponibles', stock_record.disponibles,
    'already_scanned', already_scanned,
    'available_to_scan', available_to_scan
  );
END;
$$;

COMMENT ON FUNCTION validate_product_available IS 'Validates product availability for free picking, considering already scanned quantities in active sessions';
