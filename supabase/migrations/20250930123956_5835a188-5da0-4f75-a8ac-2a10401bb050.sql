-- Update RLS policies to allow supervisors to manage migration mode

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can read system settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admins can update system settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admins can insert system settings" ON public.system_settings;

-- Admins and supervisors can read settings
CREATE POLICY "Admins and supervisors can read system settings"
ON public.system_settings
FOR SELECT
TO authenticated
USING (
  user_has_role('admin') OR 
  user_has_permission('manage_system_settings') OR
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid() 
    AND ut.name IN ('admin', 'supervisor')
  )
);

-- Admins and supervisors can update settings
CREATE POLICY "Admins and supervisors can update system settings"
ON public.system_settings
FOR UPDATE
TO authenticated
USING (
  user_has_role('admin') OR 
  user_has_permission('manage_system_settings') OR
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid() 
    AND ut.name IN ('admin', 'supervisor')
  )
)
WITH CHECK (
  user_has_role('admin') OR 
  user_has_permission('manage_system_settings') OR
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid() 
    AND ut.name IN ('admin', 'supervisor')
  )
);

-- Admins and supervisors can insert settings
CREATE POLICY "Admins and supervisors can insert system settings"
ON public.system_settings
FOR INSERT
TO authenticated
WITH CHECK (
  user_has_role('admin') OR 
  user_has_permission('manage_system_settings') OR
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid() 
    AND ut.name IN ('admin', 'supervisor')
  )
);