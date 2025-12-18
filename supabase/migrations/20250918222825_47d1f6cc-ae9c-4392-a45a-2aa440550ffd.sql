-- Add configuration access permission
INSERT INTO public.permissions (name, display_name, description, category) VALUES
('manage_configuration', 'Gestionar Configuración', 'Acceso a la configuración del sistema', 'system');