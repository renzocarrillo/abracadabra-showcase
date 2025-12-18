-- =====================================================================
-- COMPREHENSIVE PERMISSIONS SYSTEM FOR ABRACADABRA - COMPLETE REBUILD
-- =====================================================================

-- Step 1: Remove ALL existing permissions and their relationships
DELETE FROM user_type_permissions;
DELETE FROM permissions;

-- =====================================================================
-- CATEGORY: DASHBOARD
-- =====================================================================
INSERT INTO permissions (name, display_name, description, category) VALUES
('view_dashboard', 'Ver Dashboard', 'Acceso al panel principal con métricas y estadísticas', 'dashboard'),
('view_dashboard_stats', 'Ver Estadísticas Completas', 'Ver todas las estadísticas y métricas del dashboard', 'dashboard'),
('view_picking_performance', 'Ver Rendimiento de Pickers', 'Ver estadísticas de rendimiento de los pickers', 'dashboard');

-- =====================================================================
-- CATEGORY: ORDERS (Pedidos)
-- =====================================================================
INSERT INTO permissions (name, display_name, description, category) VALUES
-- Visualización
('view_orders', 'Ver Pedidos', 'Ver lista de pedidos del sistema', 'orders'),
('view_orders_all', 'Ver Todos los Pedidos', 'Ver pedidos de todas las tiendas sin restricción', 'orders'),
('view_orders_details', 'Ver Detalles de Pedidos', 'Ver información detallada de cada pedido', 'orders'),
('view_orders_archived', 'Ver Pedidos Archivados', 'Acceso al historial de pedidos completados', 'orders'),
-- Gestión
('create_orders', 'Crear Pedidos', 'Crear nuevos pedidos en el sistema', 'orders'),
('edit_orders', 'Editar Pedidos', 'Modificar pedidos existentes', 'orders'),
('delete_orders', 'Eliminar Pedidos', 'Eliminar pedidos del sistema', 'orders'),
('manage_orders', 'Gestionar Pedidos Completo', 'Acceso completo a gestión de pedidos (crear, editar, eliminar)', 'orders'),
-- Preparación
('prepare_orders', 'Preparar Pedidos', 'Acceso al módulo de preparación de pedidos', 'orders'),
('picking_orders', 'Realizar Picking de Pedidos', 'Ejecutar el proceso de picking de productos', 'orders'),
('verify_orders', 'Verificar Pedidos', 'Verificar productos pickeados antes de completar', 'orders'),
('complete_orders', 'Completar Pedidos', 'Marcar pedidos como completados', 'orders'),
('archive_orders', 'Archivar Pedidos', 'Archivar pedidos completados', 'orders'),
-- Ajustes y firmas
('adjust_picking_orders', 'Ajustar Picking de Pedidos', 'Realizar ajustes durante el picking (productos no encontrados, cantidades)', 'orders'),
('sign_orders', 'Firmar Pedidos', 'Firmar revisión de pedidos completados', 'orders'),
('view_orders_signatures', 'Ver Firmas de Pedidos', 'Ver historial de firmas de pedidos', 'orders');

-- =====================================================================
-- CATEGORY: SALES (Ventas)
-- =====================================================================
INSERT INTO permissions (name, display_name, description, category) VALUES
-- Visualización
('view_sales', 'Ver Ventas', 'Ver lista de ventas del sistema', 'sales'),
('view_sales_all', 'Ver Todas las Ventas', 'Ver ventas sin restricción', 'sales'),
('view_sales_details', 'Ver Detalles de Ventas', 'Ver información detallada de cada venta', 'sales'),
('view_sales_archived', 'Ver Ventas Archivadas', 'Acceso al historial de ventas completadas', 'sales'),
-- Gestión
('create_sales', 'Crear Ventas', 'Crear nuevas ventas en el sistema', 'sales'),
('edit_sales', 'Editar Ventas', 'Modificar ventas existentes', 'sales'),
('delete_sales', 'Eliminar Ventas', 'Eliminar ventas del sistema', 'sales'),
('manage_sales', 'Gestionar Ventas Completo', 'Acceso completo a gestión de ventas', 'sales'),
-- Preparación
('prepare_sales', 'Preparar Ventas', 'Acceso al módulo de preparación de ventas', 'sales'),
('picking_sales', 'Realizar Picking de Ventas', 'Ejecutar el proceso de picking para ventas', 'sales'),
('verify_sales', 'Verificar Ventas', 'Verificar productos de ventas antes de completar', 'sales'),
('complete_sales', 'Completar Ventas', 'Marcar ventas como completadas', 'sales'),
('archive_sales', 'Archivar Ventas', 'Archivar ventas completadas', 'sales'),
-- Ajustes y firmas
('adjust_picking_sales', 'Ajustar Picking de Ventas', 'Realizar ajustes durante el picking de ventas', 'sales'),
('sign_sales', 'Firmar Ventas', 'Firmar revisión de ventas completadas', 'sales'),
('view_sales_signatures', 'Ver Firmas de Ventas', 'Ver historial de firmas de ventas', 'sales');

-- ===================================================================
-- CATEGORY: PICKING (Operaciones de Picking)
-- =====================================================================
INSERT INTO permissions (name, display_name, description, category) VALUES
-- Picking General
('picking_operations', 'Operaciones de Picking', 'Realizar operaciones generales de picking', 'picking'),
('view_picking_sessions', 'Ver Sesiones de Picking', 'Ver sesiones de picking activas y completadas', 'picking'),
('view_picking_details', 'Ver Detalles de Picking', 'Ver información detallada de sesiones de picking', 'picking'),
-- Picking Libre
('free_picking', 'Picking Libre', 'Acceso al módulo de picking libre (sin pedido específico)', 'picking'),
('create_free_picking', 'Crear Sesiones de Picking Libre', 'Iniciar nuevas sesiones de picking libre', 'picking'),
('complete_free_picking', 'Completar Picking Libre', 'Finalizar sesiones de picking libre', 'picking'),
('delete_free_picking', 'Eliminar Picking Libre', 'Eliminar sesiones de picking libre', 'picking'),
-- Ajustes
('adjust_picking', 'Realizar Ajustes en Picking', 'Hacer ajustes de cantidad, ubicación o productos durante picking', 'picking'),
('view_picking_adjustments', 'Ver Ajustes de Picking', 'Ver historial de ajustes realizados en picking', 'picking'),
-- Verificación
('verify_picking', 'Verificar Picking', 'Verificar productos pickeados antes de completar', 'picking');

-- =====================================================================
-- CATEGORY: INVENTORY (Inventario)
-- =====================================================================
INSERT INTO permissions (name, display_name, description, category) VALUES
-- Visualización
('view_inventory', 'Ver Inventario', 'Ver estado del inventario general', 'inventory'),
('view_inventory_details', 'Ver Detalles de Inventario', 'Ver información detallada de inventario por producto', 'inventory'),
('view_inventory_reports', 'Ver Reportes de Inventario', 'Acceso a reportes de inventario', 'inventory'),
-- Gestión
('manage_inventory', 'Gestionar Inventario', 'Gestión completa del inventario (conteos, ajustes, reportes)', 'inventory'),
('create_inventory_count', 'Crear Conteos de Inventario', 'Iniciar conteos físicos de inventario', 'inventory'),
('complete_inventory_count', 'Completar Conteos', 'Finalizar y procesar conteos de inventario', 'inventory'),
('adjust_inventory', 'Ajustar Inventario', 'Realizar ajustes manuales en el inventario', 'inventory'),
-- Conteos por bin
('create_bin_inventory', 'Crear Conteo por Bin', 'Iniciar conteos físicos de bins específicos', 'inventory'),
('complete_bin_inventory', 'Completar Conteo por Bin', 'Finalizar conteos de bins', 'inventory'),
('view_bin_inventory', 'Ver Conteos por Bin', 'Ver historial de conteos por bin', 'inventory');

-- =====================================================================
-- CATEGORY: STOCK (Gestión de Stock)
-- =====================================================================
INSERT INTO permissions (name, display_name, description, category) VALUES
-- Visualización
('view_stock', 'Ver Stock', 'Ver niveles de stock del almacén', 'stock'),
('view_stock_all', 'Ver Todo el Stock', 'Ver stock de todas las ubicaciones sin restricción', 'stock'),
('view_stock_movements', 'Ver Movimientos de Stock', 'Ver historial de movimientos de stock', 'stock'),
('view_stock_totals', 'Ver Totales de Stock', 'Ver totales consolidados de stock', 'stock'),
-- Gestión
('manage_stock', 'Gestionar Stock', 'Gestión completa de stock (entradas, salidas, ajustes)', 'stock'),
('stock_entry', 'Entradas de Stock', 'Registrar entradas de stock (recepciones)', 'stock'),
('stock_withdrawal', 'Salidas de Stock', 'Registrar salidas de stock (consumos)', 'stock'),
('stock_transfer', 'Transferencias de Stock', 'Transferir stock entre ubicaciones', 'stock'),
('import_stock', 'Importar Stock', 'Importar stock desde archivos Excel', 'stock'),
('import_stock_withdrawal', 'Importar Salidas', 'Importar salidas de stock desde Excel', 'stock'),
-- Ajustes
('adjust_stock', 'Ajustar Stock', 'Realizar ajustes manuales de cantidades de stock', 'stock'),
('sync_stock_bsale', 'Sincronizar con BSale', 'Sincronizar inventario con sistema BSale', 'stock');

-- =====================================================================
-- CATEGORY: BINS (Gestión de Ubicaciones)
-- =====================================================================
INSERT INTO permissions (name, display_name, description, category) VALUES
-- Visualización
('view_bins', 'Ver Bins', 'Ver lista de ubicaciones (bins) del almacén', 'bins'),
('view_bins_stock', 'Ver Stock por Bin', 'Ver stock detallado de cada bin', 'bins'),
-- Creación y edición básica
('create_bins', 'Crear Bins', 'Crear nuevas ubicaciones en el almacén', 'bins'),
('edit_bins_own', 'Editar Bins Propios', 'Editar bins creados por el mismo usuario', 'bins'),
('delete_bins_own', 'Eliminar Bins Propios', 'Eliminar bins creados por el mismo usuario', 'bins'),
-- Gestión avanzada
('manage_bins_all', 'Gestionar Todos los Bins', 'Gestión completa de todos los bins (crear, editar, eliminar cualquiera)', 'bins'),
('freeze_bins', 'Congelar Bins', 'Congelar y descongelar bins', 'bins'),
('move_products', 'Mover Productos entre Bins', 'Reubicar productos entre diferentes bins', 'bins');

-- =====================================================================
-- CATEGORY: PRODUCTS (Gestión de Productos)
-- =====================================================================
INSERT INTO permissions (name, display_name, description, category) VALUES
-- Visualización
('view_products', 'Ver Productos', 'Ver catálogo de productos', 'products'),
('view_products_details', 'Ver Detalles de Productos', 'Ver información completa de cada producto', 'products'),
('view_product_location', 'Ver Ubicación de Productos', 'Ver en qué bins está ubicado cada producto', 'products'),
-- Gestión
('manage_products', 'Gestionar Productos', 'Gestión completa de productos (crear, editar, eliminar)', 'products'),
('create_products', 'Crear Productos', 'Agregar nuevos productos al catálogo', 'products'),
('edit_products', 'Editar Productos', 'Modificar información de productos', 'products'),
('delete_products', 'Eliminar Productos', 'Eliminar productos del catálogo', 'products'),
-- Ubicación
('assign_product_location', 'Asignar Ubicación', 'Asignar productos a ubicaciones específicas', 'products'),
-- Productos congelados
('view_frozen_products', 'Ver Productos Congelados', 'Ver lista de productos congelados', 'products'),
('manage_frozen_products', 'Gestionar Productos Congelados', 'Congelar y descongelar productos', 'products'),
('freeze_products', 'Congelar Productos', 'Marcar productos como congelados', 'products'),
('unfreeze_products', 'Descongelar Productos', 'Quitar estado de congelado a productos', 'products'),
-- Contadores
('use_product_counter', 'Usar Contador de Productos', 'Acceso al módulo de conteo rápido de productos', 'products'),
-- Etiquetas
('print_labels', 'Imprimir Etiquetas', 'Imprimir etiquetas de productos', 'products');

-- =====================================================================
-- CATEGORY: STORES (Tiendas Físicas)
-- =====================================================================
INSERT INTO permissions (name, display_name, description, category) VALUES
-- Visualización
('view_stores', 'Ver Tiendas', 'Ver lista de tiendas físicas', 'stores'),
('view_stores_details', 'Ver Detalles de Tiendas', 'Ver información completa de cada tienda', 'stores'),
('view_stores_stock', 'Ver Stock de Tiendas', 'Ver niveles de stock en tiendas físicas', 'stores'),
-- Gestión
('manage_stores', 'Gestionar Tiendas', 'Gestión completa de tiendas (crear, editar, eliminar)', 'stores'),
('create_stores', 'Crear Tiendas', 'Agregar nuevas tiendas al sistema', 'stores'),
('edit_stores', 'Editar Tiendas', 'Modificar información de tiendas', 'stores'),
('delete_stores', 'Eliminar Tiendas', 'Eliminar tiendas del sistema', 'stores'),
-- Operaciones
('manage_physical_stores', 'Gestión de Operaciones', 'Gestionar operaciones de tiendas físicas', 'stores'),
('view_store_orders', 'Ver Pedidos de Tiendas', 'Ver pedidos específicos para tiendas', 'stores');

-- =====================================================================
-- CATEGORY: TRANSFERS (Traslados)
-- =====================================================================
INSERT INTO permissions (name, display_name, description, category) VALUES
-- Visualización
('view_transfers', 'Ver Traslados', 'Ver lista de traslados internos y externos', 'transfers'),
('view_transfers_details', 'Ver Detalles de Traslados', 'Ver información detallada de cada traslado', 'transfers'),
-- Gestión
('manage_transfers', 'Gestionar Traslados', 'Gestión completa de traslados', 'transfers'),
('create_internal_transfer', 'Crear Traslados Internos', 'Crear traslados entre ubicaciones internas', 'transfers'),
('create_external_transfer', 'Crear Traslados Externos', 'Crear traslados hacia tiendas u oficinas externas', 'transfers'),
('create_store_transfer', 'Crear Traslados a Tiendas', 'Crear traslados específicos para tiendas', 'transfers'),
('complete_transfer', 'Completar Traslados', 'Finalizar y procesar traslados', 'transfers'),
('cancel_transfer', 'Cancelar Traslados', 'Cancelar traslados pendientes', 'transfers');

-- =====================================================================
-- CATEGORY: DOCUMENTS (Documentos BSale)
-- =====================================================================
INSERT INTO permissions (name, display_name, description, category) VALUES
-- Visualización
('view_documents', 'Ver Documentos', 'Ver documentos emitidos (boletas, facturas, guías)', 'documents'),
('view_documents_details', 'Ver Detalles de Documentos', 'Ver información completa de documentos', 'documents'),
-- Emisión - Boletas
('emit_boleta', 'Emitir Boletas', 'Emitir boletas de venta', 'documents'),
('emit_boleta_with_guide', 'Emitir Boleta con Guía', 'Emitir boletas junto con guía de remisión', 'documents'),
-- Emisión - Facturas
('emit_factura', 'Emitir Facturas', 'Emitir facturas de venta', 'documents'),
('emit_factura_with_guide', 'Emitir Factura con Guía', 'Emitir facturas junto con guía de remisión', 'documents'),
-- Emisión - Guías
('emit_remission_guide', 'Emitir Guías de Remisión', 'Emitir guías de remisión independientes', 'documents'),
('emit_transfer_guide', 'Emitir Guías de Traslado', 'Emitir guías para traslados internos', 'documents'),
-- Emisión - Tickets
('emit_ticket_natural', 'Emitir Ticket Persona Natural', 'Emitir tickets para personas naturales', 'documents'),
('emit_ticket_empresa', 'Emitir Ticket Empresa', 'Emitir tickets para empresas', 'documents'),
-- Gestión
('manage_documents', 'Gestionar Documentos', 'Gestión completa de documentos tributarios', 'documents'),
('void_documents', 'Anular Documentos', 'Anular documentos emitidos', 'documents'),
('resend_documents', 'Reenviar Documentos', 'Reenviar documentos a clientes', 'documents');

-- =====================================================================
-- CATEGORY: REPORTS (Reportes)
-- =====================================================================
INSERT INTO permissions (name, display_name, description, category) VALUES
-- Reportes de ventas
('view_sales_reports', 'Ver Reportes de Ventas', 'Acceso a reportes de ventas', 'reports'),
('view_sales_by_product', 'Ver Ventas por Producto', 'Reporte de ventas agrupadas por producto', 'reports'),
('view_sales_by_period', 'Ver Ventas por Período', 'Reporte de ventas por períodos de tiempo', 'reports'),
-- Reportes de inventario
('view_reports_inventory', 'Ver Reportes de Inventario', 'Acceso a reportes de inventario', 'reports'),
('generate_inventory_reports', 'Generar Reportes de Inventario', 'Crear reportes personalizados de inventario', 'reports'),
('export_inventory_reports', 'Exportar Reportes de Inventario', 'Exportar reportes a Excel/PDF', 'reports'),
-- Reportes de picking
('view_picking_reports', 'Ver Reportes de Picking', 'Reportes de rendimiento de picking', 'reports'),
('view_picker_performance', 'Ver Rendimiento de Pickers', 'Estadísticas detalladas de cada picker', 'reports'),
-- Reportes de stock
('view_stock_reports', 'Ver Reportes de Stock', 'Reportes de movimientos y niveles de stock', 'reports'),
('view_stock_trends', 'Ver Tendencias de Stock', 'Gráficos y tendencias de evolución del stock', 'reports'),
-- Reportes generales
('export_all_reports', 'Exportar Todos los Reportes', 'Capacidad de exportar cualquier reporte del sistema', 'reports');

-- =====================================================================
-- CATEGORY: ADMIN (Administración)
-- =====================================================================
INSERT INTO permissions (name, display_name, description, category) VALUES
-- Usuarios
('view_users', 'Ver Usuarios', 'Ver lista de usuarios del sistema', 'admin'),
('manage_users', 'Gestionar Usuarios', 'Crear, editar y gestionar usuarios', 'admin'),
('create_users', 'Crear Usuarios', 'Agregar nuevos usuarios al sistema', 'admin'),
('edit_users', 'Editar Usuarios', 'Modificar información de usuarios', 'admin'),
('delete_users', 'Eliminar Usuarios', 'Eliminar usuarios del sistema (soft delete)', 'admin'),
('change_user_passwords', 'Cambiar Contraseñas', 'Cambiar contraseñas de usuarios', 'admin'),
('change_admin_passwords', 'Cambiar Contraseñas Admin', 'Cambiar contraseñas de administradores', 'admin'),
-- Tipos de usuario y permisos
('view_user_types', 'Ver Tipos de Usuario', 'Ver configuración de tipos de usuario', 'admin'),
('manage_user_types', 'Gestionar Tipos de Usuario', 'Crear y gestionar tipos de usuario y permisos', 'admin'),
('assign_permissions', 'Asignar Permisos', 'Asignar permisos a tipos de usuario', 'admin'),
-- Auditoría
('view_audit_logs', 'Ver Logs de Auditoría', 'Acceso a registros de auditoría del sistema', 'admin'),
('view_security_logs', 'Ver Logs de Seguridad', 'Ver registros de seguridad y accesos', 'admin'),
('view_change_history', 'Ver Historial de Cambios', 'Ver historial completo de cambios en el sistema', 'admin'),
-- Configuración
('manage_configuration', 'Gestionar Configuración', 'Acceso a configuración general del sistema', 'admin'),
('manage_system_settings', 'Gestionar Configuración del Sistema', 'Modificar configuraciones avanzadas del sistema', 'admin');

-- =====================================================================
-- CATEGORY: INTEGRATIONS (Integraciones)
-- =====================================================================
INSERT INTO permissions (name, display_name, description, category) VALUES
-- Shopify
('view_shopify', 'Ver Integración Shopify', 'Ver estado de integración con Shopify', 'integrations'),
('manage_shopify', 'Gestionar Shopify', 'Configurar y gestionar integración con Shopify', 'integrations'),
('sync_shopify', 'Sincronizar Shopify', 'Sincronizar órdenes y productos con Shopify', 'integrations'),
-- BSale
('view_bsale', 'Ver Integración BSale', 'Ver estado de integración con BSale', 'integrations'),
('manage_bsale', 'Gestionar BSale', 'Configurar y gestionar integración con BSale', 'integrations'),
('sync_bsale', 'Sincronizar BSale', 'Sincronizar datos con BSale', 'integrations'),
('test_bsale', 'Probar Conexión BSale', 'Probar conectividad con API de BSale', 'integrations'),
-- Otras integraciones
('manage_integrations', 'Gestionar Integraciones', 'Administrar todas las integraciones del sistema', 'integrations'),
('view_integration_logs', 'Ver Logs de Integraciones', 'Ver registros de sincronizaciones y errores', 'integrations');

-- =====================================================================
-- CATEGORY: SYSTEM (Sistema)
-- =====================================================================
INSERT INTO permissions (name, display_name, description, category) VALUES
-- Acceso general
('system_full_access', 'Acceso Completo al Sistema', 'Acceso sin restricciones a todas las funciones', 'system'),
-- Mantenimiento
('system_maintenance', 'Mantenimiento del Sistema', 'Realizar tareas de mantenimiento', 'system'),
('system_backup', 'Respaldos del Sistema', 'Crear y restaurar respaldos', 'system'),
('system_reset', 'Reiniciar Sistema', 'Reiniciar módulos del sistema (usar con precaución)', 'system'),
-- Configuración avanzada
('system_advanced_config', 'Configuración Avanzada', 'Acceso a configuraciones avanzadas del sistema', 'system'),
('manage_database', 'Gestionar Base de Datos', 'Acceso a herramientas de gestión de base de datos', 'system');