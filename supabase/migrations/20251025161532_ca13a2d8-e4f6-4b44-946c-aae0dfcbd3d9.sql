-- Corregir función is_target_user_admin para verificar tanto role como user_type.is_admin
CREATE OR REPLACE FUNCTION public.is_target_user_admin(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles p
        LEFT JOIN user_types ut ON p.user_type_id = ut.id
        WHERE p.id = target_user_id 
        AND (
            p.role = 'admin'::user_role 
            OR ut.is_admin = true
        )
    );
$$;