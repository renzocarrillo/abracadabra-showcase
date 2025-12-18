-- Create helper function for checking permissions
CREATE OR REPLACE FUNCTION public.user_has_permission(permission_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE 
    WHEN auth.uid() IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM profiles p
      LEFT JOIN user_types ut ON p.user_type_id = ut.id
      LEFT JOIN user_type_permissions utp ON ut.id = utp.user_type_id
      LEFT JOIN permissions perm ON utp.permission_id = perm.id
      WHERE p.id = auth.uid()
        AND p.deleted_at IS NULL
        AND (
          -- User type is admin (has all permissions)
          ut.is_admin = true
          OR
          -- User has this specific permission
          perm.name = permission_name
          OR
          -- Fallback to old role system for users without user_type_id
          (p.user_type_id IS NULL AND p.role = 'admin'::user_role)
        )
    )
  END;
$$;

-- Create helper function to check if supervisor is trying to modify admin
CREATE OR REPLACE FUNCTION public.supervisor_cannot_modify_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid()
      AND ut.name = 'supervisor'
  );
$$;

-- Create helper function to check if target user is admin
CREATE OR REPLACE FUNCTION public.is_target_user_admin(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    LEFT JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = target_user_id
      AND (
        p.role = 'admin'::user_role
        OR ut.is_admin = true
      )
  );
$$;

COMMENT ON FUNCTION public.user_has_permission(text) IS 'Checks if the current user has a specific permission based on their user_type. Returns true if user is admin or has the permission assigned.';
COMMENT ON FUNCTION public.supervisor_cannot_modify_admin() IS 'Returns true if current user is a supervisor (used to restrict supervisors from modifying admins)';
COMMENT ON FUNCTION public.is_target_user_admin(uuid) IS 'Returns true if the target user is an admin (either by role or user_type)';