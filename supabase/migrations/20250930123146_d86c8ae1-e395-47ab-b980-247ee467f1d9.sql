-- Create system_settings table for global configuration
CREATE TABLE IF NOT EXISTS public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text UNIQUE NOT NULL,
  setting_value jsonb NOT NULL,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Admins can read settings
CREATE POLICY "Admins can read system settings"
ON public.system_settings
FOR SELECT
TO authenticated
USING (user_has_role('admin'));

-- Admins can update settings
CREATE POLICY "Admins can update system settings"
ON public.system_settings
FOR UPDATE
TO authenticated
USING (user_has_role('admin'))
WITH CHECK (user_has_role('admin'));

-- Admins can insert settings
CREATE POLICY "Admins can insert system settings"
ON public.system_settings
FOR INSERT
TO authenticated
WITH CHECK (user_has_role('admin'));

-- Insert default migration_mode setting
INSERT INTO public.system_settings (setting_key, setting_value) 
VALUES ('migration_mode', '{"enabled": false, "activated_at": null, "activated_by": null, "activated_by_name": null}'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;

-- Function to check migration mode (for edge functions)
CREATE OR REPLACE FUNCTION public.is_migration_mode_active()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mode_enabled boolean;
BEGIN
  SELECT (setting_value->>'enabled')::boolean
  INTO mode_enabled
  FROM system_settings
  WHERE setting_key = 'migration_mode';
  
  RETURN COALESCE(mode_enabled, false);
END;
$$;