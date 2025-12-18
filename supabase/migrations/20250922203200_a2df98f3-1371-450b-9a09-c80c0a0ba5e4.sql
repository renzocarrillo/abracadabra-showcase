-- Asignar permiso de configuración al supervisor
INSERT INTO user_type_permissions (user_type_id, permission_id)
SELECT 
  ut.id, 
  p.id
FROM user_types ut, permissions p
WHERE ut.name = 'supervisor' 
  AND p.name = 'manage_configuration';