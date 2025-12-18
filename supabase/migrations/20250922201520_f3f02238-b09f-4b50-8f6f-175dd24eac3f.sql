-- Grant supervisor all admin permissions except restricted ones
-- First, get the supervisor and admin user type IDs
DO $$
DECLARE
    supervisor_id uuid;
    admin_id uuid;
    perm_record RECORD;
BEGIN
    -- Get user type IDs
    SELECT id INTO supervisor_id FROM user_types WHERE name = 'supervisor';
    SELECT id INTO admin_id FROM user_types WHERE name = 'admin';
    
    -- Grant all admin permissions to supervisor that they don't already have
    FOR perm_record IN 
        SELECT p.id, p.name
        FROM permissions p
        JOIN user_type_permissions utp ON p.id = utp.permission_id
        WHERE utp.user_type_id = admin_id
        AND p.id NOT IN (
            SELECT permission_id 
            FROM user_type_permissions 
            WHERE user_type_id = supervisor_id
        )
    LOOP
        INSERT INTO user_type_permissions (user_type_id, permission_id)
        VALUES (supervisor_id, perm_record.id);
        
        RAISE NOTICE 'Granted permission % to supervisor', perm_record.name;
    END LOOP;
END $$;

-- Create function to check if target user is admin (for restrictions)
CREATE OR REPLACE FUNCTION public.is_target_user_admin(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = target_user_id AND role = 'admin'::user_role
    );
$$;

-- Create function to check if current user is supervisor trying to modify admin
CREATE OR REPLACE FUNCTION public.supervisor_cannot_modify_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER  
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles p
        JOIN user_types ut ON p.user_type_id = ut.id
        WHERE p.id = auth.uid() 
        AND ut.name = 'supervisor'
    );
$$;

-- Update profiles policy to restrict supervisor from modifying admin profiles
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;

CREATE POLICY "Admins can update any profile" 
ON public.profiles 
FOR UPDATE 
USING (
    user_has_role('admin'::text) OR 
    (
        user_has_permission('manage_users'::text) AND 
        NOT (supervisor_cannot_modify_admin() AND is_target_user_admin(profiles.id))
    )
)
WITH CHECK (
    user_has_role('admin'::text) OR 
    (
        user_has_permission('manage_users'::text) AND 
        NOT (supervisor_cannot_modify_admin() AND is_target_user_admin(profiles.id))
    )
);

-- Update user_types policy to restrict supervisor from modifying admin permissions
DROP POLICY IF EXISTS "Admins can manage user types" ON public.user_types;

CREATE POLICY "Admins can manage user types"
ON public.user_types 
FOR ALL
USING (
    user_has_role('admin'::text) OR 
    user_has_permission('manage_user_types'::text)
)
WITH CHECK (
    user_has_role('admin'::text) OR 
    user_has_permission('manage_user_types'::text)
);

-- Update user_type_permissions policy to restrict supervisor from modifying admin user type permissions
DROP POLICY IF EXISTS "Admins can manage user type permissions" ON public.user_type_permissions;

CREATE POLICY "Admins can manage user type permissions"
ON public.user_type_permissions 
FOR ALL
USING (
    user_has_role('admin'::text) OR 
    (
        user_has_permission('manage_user_types'::text) AND 
        NOT EXISTS (
            SELECT 1 FROM user_types ut 
            WHERE ut.id = user_type_permissions.user_type_id 
            AND ut.name = 'admin'
            AND supervisor_cannot_modify_admin()
        )
    )
)
WITH CHECK (
    user_has_role('admin'::text) OR 
    (
        user_has_permission('manage_user_types'::text) AND 
        NOT EXISTS (
            SELECT 1 FROM user_types ut 
            WHERE ut.id = user_type_permissions.user_type_id 
            AND ut.name = 'admin'
            AND supervisor_cannot_modify_admin()
        )
    )
);

-- Create new permissions for password management restrictions
INSERT INTO permissions (name, display_name, description, category) 
VALUES 
    ('change_admin_passwords', 'Cambiar Contraseñas de Administradores', 'Permite cambiar contraseñas de usuarios administradores', 'admin')
ON CONFLICT (name) DO NOTHING;

-- Grant the new permission only to admins
DO $$
DECLARE
    admin_id uuid;
    perm_id uuid;
BEGIN
    SELECT id INTO admin_id FROM user_types WHERE name = 'admin';
    SELECT id INTO perm_id FROM permissions WHERE name = 'change_admin_passwords';
    
    INSERT INTO user_type_permissions (user_type_id, permission_id)
    VALUES (admin_id, perm_id)
    ON CONFLICT DO NOTHING;
END $$;