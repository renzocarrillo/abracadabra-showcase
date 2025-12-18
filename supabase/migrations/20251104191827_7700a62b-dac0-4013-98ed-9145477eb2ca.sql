-- Fix PIN functions to use schema-qualified pgcrypto functions

-- 1) validate_signature_pin -> use extensions.crypt
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
    -- Verificar hash usando crypt de pgcrypto (schema-qualified)
    IF v_profile.signature_pin_hash = extensions.crypt(p_pin, v_profile.signature_pin_hash) THEN
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

-- 2) set_signature_pin -> use extensions.gen_salt and extensions.crypt
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

  -- Generar hash del nuevo PIN usando bcrypt (schema-qualified)
  v_new_hash := extensions.crypt(p_pin, extensions.gen_salt('bf', 10));

  -- Verificar que el hash generado no esté en uso por otro usuario
  IF EXISTS (
    SELECT 1 
    FROM profiles 
    WHERE id != v_user_id 
      AND signature_pin_hash IS NOT NULL
      AND deleted_at IS NULL
  ) THEN
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
        IF v_other_user.signature_pin_hash = extensions.crypt(p_pin, v_other_user.signature_pin_hash) THEN
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
