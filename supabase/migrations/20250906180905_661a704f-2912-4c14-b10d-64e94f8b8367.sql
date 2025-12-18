-- Crear el usuario administrador
-- Primero necesitamos insertar en auth.users, pero como es una tabla del sistema
-- vamos a crear una función que simule el registro de un usuario

-- Verificar si el usuario ya existe y si no, crear el perfil administrativo
-- Nota: Para crear el usuario real en auth.users, necesitarás usar el dashboard de Supabase
-- o el signup normal. Esta migración solo asegura que si existe, tenga rol admin.

-- Función temporal para asignar rol admin a un usuario específico
CREATE OR REPLACE FUNCTION public.make_user_admin(user_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_id uuid;
BEGIN
  -- Buscar el ID del usuario por email en auth.users
  SELECT id INTO user_id
  FROM auth.users
  WHERE email = user_email;
  
  IF user_id IS NOT NULL THEN
    -- Actualizar el rol a admin
    UPDATE public.profiles
    SET role = 'admin'
    WHERE id = user_id;
    
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;