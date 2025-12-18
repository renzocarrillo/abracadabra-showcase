
-- RPC para validar que un bin existe
CREATE OR REPLACE FUNCTION validate_bin_exists(
  p_bin_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  bin_record RECORD;
BEGIN
  -- Check if bin exists
  SELECT id, bin_code, is_frozen
  INTO bin_record
  FROM bins
  WHERE bin_code = p_bin_code;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'exists', false,
      'message', format('El bin "%s" no existe en el sistema', p_bin_code)
    );
  END IF;
  
  -- Check if bin is frozen
  IF bin_record.is_frozen = true THEN
    RETURN jsonb_build_object(
      'exists', true,
      'is_frozen', true,
      'message', format('El bin "%s" está congelado por inventario', p_bin_code)
    );
  END IF;
  
  RETURN jsonb_build_object(
    'exists', true,
    'is_frozen', false,
    'message', 'Bin disponible',
    'bin_code', bin_record.bin_code
  );
END;
$$;

COMMENT ON FUNCTION validate_bin_exists IS 'Validates that a bin exists in the system before scanning';
