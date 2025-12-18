-- Fase 1: Sistema de Firma con PIN de 6 Dígitos

-- 1. Agregar columnas de PIN en la tabla profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS signature_pin_hash TEXT,
ADD COLUMN IF NOT EXISTS signature_pin_created_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS signature_pin_updated_at TIMESTAMP WITH TIME ZONE;

-- 2. Crear índice único para garantizar que cada PIN sea único
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_signature_pin_hash 
ON profiles(signature_pin_hash) 
WHERE signature_pin_hash IS NOT NULL;

-- 3. Agregar comentarios para documentación
COMMENT ON COLUMN profiles.signature_pin_hash IS 'Bcrypt hash del PIN de 6 dígitos para firma digital. Debe ser único.';
COMMENT ON COLUMN profiles.signature_pin_created_at IS 'Fecha de creación inicial del PIN';
COMMENT ON COLUMN profiles.signature_pin_updated_at IS 'Fecha de última actualización del PIN';

-- 4. Función RPC: Validar PIN de forma segura
CREATE OR REPLACE FUNCTION validate_signature_pin(p_pin TEXT)
RETURNS TABLE(
  user_id UUID,
  user_name TEXT,
  user_email TEXT,
  is_valid BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
BEGIN
  -- Validar formato del PIN (6 dígitos numéricos)
  IF LENGTH(p_pin) != 6 OR p_pin !~ '^[0-9]{6}$' THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, NULL::TEXT, FALSE;
    RETURN;
  END IF;

  -- Buscar usuario autorizado con PIN que coincida
  FOR v_profile IN 
    SELECT p.id, p.full_name, p.email, p.signature_pin_hash, ut.name as user_type_name
    FROM profiles p
    LEFT JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.signature_pin_hash IS NOT NULL
      AND p.deleted_at IS NULL
      AND (
        p.role = 'admin'::user_role 
        OR ut.name IN ('supervisor', 'admin')
        OR EXISTS (
          SELECT 1 
          FROM user_type_permissions utp
          JOIN permissions perm ON utp.permission_id = perm.id
          WHERE utp.user_type_id = p.user_type_id
            AND perm.name = 'sign_orders'
        )
      )
  LOOP
    -- Verificar hash usando crypt de pgcrypto
    IF v_profile.signature_pin_hash = crypt(p_pin, v_profile.signature_pin_hash) THEN
      RETURN QUERY SELECT 
        v_profile.id,
        COALESCE(v_profile.full_name, v_profile.email),
        v_profile.email,
        TRUE;
      RETURN;
    END IF;
  END LOOP;

  -- Si llegamos aquí, el PIN no es válido
  RETURN QUERY SELECT NULL::UUID, NULL::TEXT, NULL::TEXT, FALSE;
END;
$$;

-- 5. Función RPC: Crear/Actualizar PIN
CREATE OR REPLACE FUNCTION set_signature_pin(p_pin TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_profile RECORD;
  v_new_hash TEXT;
  v_is_authorized BOOLEAN := FALSE;
  v_had_pin BOOLEAN := FALSE;
BEGIN
  -- Obtener ID del usuario actual
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', 'Usuario no autenticado');
  END IF;

  -- Validar formato del PIN
  IF LENGTH(p_pin) != 6 OR p_pin !~ '^[0-9]{6}$' THEN
    RETURN json_build_object('success', FALSE, 'error', 'El PIN debe ser exactamente 6 dígitos numéricos');
  END IF;

  -- Obtener perfil del usuario
  SELECT p.*, ut.name as user_type_name, (p.signature_pin_hash IS NOT NULL) as had_pin
  INTO v_profile
  FROM profiles p
  LEFT JOIN user_types ut ON p.user_type_id = ut.id
  WHERE p.id = v_user_id AND p.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN json_build_object('success', FALSE, 'error', 'Perfil de usuario no encontrado');
  END IF;

  v_had_pin := v_profile.had_pin;

  -- Verificar autorización (admin, supervisor, o permiso sign_orders)
  IF v_profile.role = 'admin'::user_role THEN
    v_is_authorized := TRUE;
  ELSIF v_profile.user_type_name IN ('supervisor', 'admin') THEN
    v_is_authorized := TRUE;
  ELSIF EXISTS (
    SELECT 1 
    FROM user_type_permissions utp
    JOIN permissions perm ON utp.permission_id = perm.id
    WHERE utp.user_type_id = v_profile.user_type_id
      AND perm.name = 'sign_orders'
  ) THEN
    v_is_authorized := TRUE;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN json_build_object('success', FALSE, 'error', 'No tienes permisos para configurar un PIN de firma');
  END IF;

  -- Generar hash del nuevo PIN usando bcrypt
  v_new_hash := crypt(p_pin, gen_salt('bf', 10));

  -- Verificar que el hash generado no esté en uso por otro usuario
  -- (la probabilidad es mínima pero verificamos por seguridad)
  IF EXISTS (
    SELECT 1 
    FROM profiles 
    WHERE id != v_user_id 
      AND signature_pin_hash IS NOT NULL
      AND deleted_at IS NULL
  ) THEN
    -- Verificar si algún otro usuario tiene el mismo PIN
    DECLARE
      v_other_user RECORD;
    BEGIN
      FOR v_other_user IN 
        SELECT id, signature_pin_hash 
        FROM profiles 
        WHERE id != v_user_id 
          AND signature_pin_hash IS NOT NULL
          AND deleted_at IS NULL
      LOOP
        IF v_other_user.signature_pin_hash = crypt(p_pin, v_other_user.signature_pin_hash) THEN
          RETURN json_build_object('success', FALSE, 'error', 'Este PIN ya está en uso. Por favor elige otro.');
        END IF;
      END LOOP;
    END;
  END IF;

  -- Actualizar o crear PIN
  UPDATE profiles
  SET 
    signature_pin_hash = v_new_hash,
    signature_pin_created_at = COALESCE(signature_pin_created_at, NOW()),
    signature_pin_updated_at = NOW()
  WHERE id = v_user_id;

  -- Registrar en audit log
  INSERT INTO security_audit_log (user_id, action, table_name, record_id, details)
  VALUES (
    v_user_id,
    CASE WHEN v_had_pin THEN 'SIGNATURE_PIN_UPDATED' ELSE 'SIGNATURE_PIN_CREATED' END,
    'profiles',
    v_user_id::TEXT,
    json_build_object(
      'user_name', COALESCE(v_profile.full_name, v_profile.email),
      'timestamp', NOW()
    )
  );

  RETURN json_build_object(
    'success', TRUE, 
    'message', CASE WHEN v_had_pin THEN 'PIN actualizado exitosamente' ELSE 'PIN configurado exitosamente' END
  );
END;
$$;

-- 6. Función RPC: Verificar si usuario tiene PIN configurado
CREATE OR REPLACE FUNCTION user_has_signature_pin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM profiles 
    WHERE id = auth.uid() 
      AND signature_pin_hash IS NOT NULL
      AND deleted_at IS NULL
  );
$$;

-- 7. Función RPC: Verificar si usuario puede firmar (helper)
CREATE OR REPLACE FUNCTION can_sign_with_pin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_can_sign BOOLEAN := FALSE;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    LEFT JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid()
      AND p.deleted_at IS NULL
      AND p.signature_pin_hash IS NOT NULL
      AND (
        p.role = 'admin'::user_role
        OR ut.name IN ('supervisor', 'admin')
        OR EXISTS (
          SELECT 1
          FROM user_type_permissions utp
          JOIN permissions perm ON utp.permission_id = perm.id
          WHERE utp.user_type_id = p.user_type_id
            AND perm.name = 'sign_orders'
        )
      )
  ) INTO v_can_sign;
  
  RETURN v_can_sign;
END;
$$;

-- 8. Actualizar políticas RLS para columnas de PIN
DROP POLICY IF EXISTS "Users can view own PIN status" ON profiles;
CREATE POLICY "Users can view own PIN status"
ON profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid() 
  OR user_has_role('admin'::text)
);

DROP POLICY IF EXISTS "Users can update own PIN" ON profiles;
CREATE POLICY "Users can update own PIN"
ON profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- 9. Agregar comentarios a las funciones
COMMENT ON FUNCTION validate_signature_pin(TEXT) IS 'Valida un PIN de 6 dígitos y retorna el usuario correspondiente si es válido. SECURITY DEFINER para proteger los hashes.';
COMMENT ON FUNCTION set_signature_pin(TEXT) IS 'Crea o actualiza el PIN de firma del usuario actual. Verifica permisos y unicidad del PIN.';
COMMENT ON FUNCTION user_has_signature_pin() IS 'Verifica si el usuario actual tiene un PIN de firma configurado.';
COMMENT ON FUNCTION can_sign_with_pin() IS 'Verifica si el usuario actual tiene permisos y PIN configurado para firmar.';

-- 10. Crear índice para mejorar performance de búsquedas
CREATE INDEX IF NOT EXISTS idx_profiles_pin_not_null 
ON profiles(id) 
WHERE signature_pin_hash IS NOT NULL AND deleted_at IS NULL;