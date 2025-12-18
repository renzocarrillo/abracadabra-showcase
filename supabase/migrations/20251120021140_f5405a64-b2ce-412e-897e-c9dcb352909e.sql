-- ================================================
-- MIGRACIÓN: PERMISOS FALTANTES PICKING LIBRE (FIXED)
-- ================================================
-- Fecha: 20 de Noviembre, 2025
-- Objetivo: Agregar permisos críticos para sistema completo
-- ================================================

-- 1. Permiso para recuperar sesiones zombie manualmente
INSERT INTO permissions (name, display_name, category, description)
VALUES (
  'recover_zombie_sessions',
  'Recuperar Sesiones Zombie',
  'picking',
  'Ejecutar recovery manual de sesiones zombie abandonadas o con errores'
)
ON CONFLICT (name) DO NOTHING;

-- 2. Permiso para ver logs de auditoría de picking
INSERT INTO permissions (name, display_name, category, description)
VALUES (
  'view_picking_audit_logs',
  'Ver Logs de Auditoría de Picking',
  'picking',
  'Acceso a registros detallados de auditoría del sistema de picking libre'
)
ON CONFLICT (name) DO NOTHING;

-- 3. Permiso para gestionar emisiones (opcional pero útil)
INSERT INTO permissions (name, display_name, category, description)
VALUES (
  'manage_picking_emissions',
  'Gestionar Emisiones de Picking',
  'picking',
  'Ver y reintentar emisiones fallidas de documentos de picking'
)
ON CONFLICT (name) DO NOTHING;

-- 4. Permiso para ver estadísticas de zombies
INSERT INTO permissions (name, display_name, category, description)
VALUES (
  'view_zombie_sessions_stats',
  'Ver Estadísticas de Sesiones Zombie',
  'reports',
  'Acceso a dashboard y estadísticas de sesiones zombie y recovery'
)
ON CONFLICT (name) DO NOTHING;

-- ================================================
-- ASIGNACIÓN AUTOMÁTICA A ADMIN
-- ================================================
-- Los usuarios con rol 'admin' deben tener estos permisos

DO $$
DECLARE
  admin_user_type_id uuid;
  perm_id uuid;
BEGIN
  -- Buscar el user_type 'admin' o el primero con is_admin = true
  SELECT id INTO admin_user_type_id
  FROM user_types
  WHERE name = 'admin' OR is_admin = true
  LIMIT 1;

  IF admin_user_type_id IS NOT NULL THEN
    -- Asignar cada permiso nuevo al admin
    FOR perm_id IN 
      SELECT id FROM permissions 
      WHERE name IN (
        'recover_zombie_sessions',
        'view_picking_audit_logs',
        'manage_picking_emissions',
        'view_zombie_sessions_stats'
      )
    LOOP
      INSERT INTO user_type_permissions (user_type_id, permission_id)
      VALUES (admin_user_type_id, perm_id)
      ON CONFLICT (user_type_id, permission_id) DO NOTHING;
    END LOOP;

    RAISE NOTICE 'Permisos asignados a tipo de usuario admin: %', admin_user_type_id;
  ELSE
    RAISE NOTICE 'No se encontró tipo de usuario admin, los permisos se asignarán manualmente';
  END IF;
END $$;

-- ================================================
-- COMENTARIOS Y DOCUMENTACIÓN
-- ================================================

COMMENT ON TABLE permissions IS 'Permisos del sistema. Picking Libre tiene 20 permisos (16 base + 4 nuevos)';

-- Log de creación
DO $$
BEGIN
  RAISE NOTICE '✅ Migración completada: 4 nuevos permisos de Picking Libre creados';
  RAISE NOTICE '   - recover_zombie_sessions';
  RAISE NOTICE '   - view_picking_audit_logs';
  RAISE NOTICE '   - manage_picking_emissions';
  RAISE NOTICE '   - view_zombie_sessions_stats';
END $$;