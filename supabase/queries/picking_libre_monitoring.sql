-- ================================================
-- QUERIES DE MONITOREO - PICKING LIBRE
-- ================================================
-- Para dashboards operacionales y alertas
-- Ejecutar en Supabase SQL Editor o integrar en app
-- ================================================

-- ================================================
-- 1. SESIONES ACTIVAS POR ESTADO (últimas 24h)
-- ================================================
SELECT 
  status,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as porcentaje
FROM picking_libre_sessions
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status
ORDER BY count DESC;

-- ================================================
-- 2. TASA DE ÉXITO DE EMISIONES (últimas 7 días)
-- ================================================
SELECT 
  emission_type,
  COUNT(*) FILTER (WHERE status = 'completed') as exitosas,
  COUNT(*) FILTER (WHERE status = 'failed') as fallidas,
  COUNT(*) FILTER (WHERE status = 'pending') as pendientes,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed') / COUNT(*), 2) as tasa_exito_pct
FROM picking_libre_emissions
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY emission_type
ORDER BY tasa_exito_pct ASC;

-- ================================================
-- 3. SESIONES ZOMBIE DETECTADAS (ahora)
-- ================================================
SELECT 
  tipo_zombie,
  COUNT(*) as cantidad,
  AVG(EXTRACT(EPOCH FROM (NOW() - last_activity_at))) / 60 as minutos_inactivos_promedio
FROM detect_zombie_sessions()
GROUP BY tipo_zombie
ORDER BY cantidad DESC;

-- ================================================
-- 4. TIEMPO PROMEDIO DE FINALIZACIÓN (últimas 7 días)
-- ================================================
SELECT 
  status,
  COUNT(*) as sesiones,
  ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 60), 2) as minutos_promedio,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - created_at)) / 60), 2) as mediana_minutos,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - created_at)) / 60), 2) as p95_minutos
FROM picking_libre_sessions
WHERE completed_at IS NOT NULL
  AND completed_at > NOW() - INTERVAL '7 days'
GROUP BY status;

-- ================================================
-- 5. STOCK RESERVADO (sin consumir hace >1h)
-- ================================================
SELECT 
  s.sku,
  v.description as producto,
  SUM(s.reservado) as total_reservado,
  COUNT(DISTINCT s.bin) as bins_afectados,
  MIN(pls.last_activity_at) as actividad_mas_antigua
FROM stockxbin s
JOIN variants v ON v.sku = s.sku
LEFT JOIN picking_libre_items pli ON pli.sku = s.sku
LEFT JOIN picking_libre_sessions pls ON pls.id = pli.session_id
WHERE s.reservado > 0
  AND (pls.last_activity_at IS NULL OR pls.last_activity_at < NOW() - INTERVAL '1 hour')
GROUP BY s.sku, v.description
ORDER BY total_reservado DESC
LIMIT 20;

-- ================================================
-- 6. REINTENTOS POR SESIÓN (últimas 7 días)
-- ================================================
SELECT 
  e.session_id,
  s.created_by_name,
  s.documento_tipo,
  COUNT(*) as intentos,
  MAX(e.attempt_number) as max_attempt,
  MAX(e.status) as ultimo_estado,
  MAX(e.error_message) as ultimo_error
FROM picking_libre_emissions e
JOIN picking_libre_sessions s ON s.id = e.session_id
WHERE e.created_at > NOW() - INTERVAL '7 days'
GROUP BY e.session_id, s.created_by_name, s.documento_tipo
HAVING COUNT(*) > 1
ORDER BY intentos DESC
LIMIT 50;

-- ================================================
-- 7. EVENTOS DE AUDITORÍA CRÍTICOS (últimas 24h)
-- ================================================
SELECT 
  event_type,
  event_status,
  COUNT(*) as ocurrencias,
  COUNT(DISTINCT session_id) as sesiones_afectadas,
  MAX(created_at) as ultima_ocurrencia
FROM picking_libre_audit_log
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND event_status IN ('error', 'warning')
GROUP BY event_type, event_status
ORDER BY ocurrencias DESC;

-- ================================================
-- 8. PERFORMANCE: TIEMPO DE OPERACIONES (últimas 24h)
-- ================================================
SELECT 
  event_type,
  COUNT(*) as operaciones,
  ROUND(AVG(duration_ms), 2) as avg_ms,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms), 2) as mediana_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms), 2) as p95_ms,
  ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_ms), 2) as p99_ms,
  MAX(duration_ms) as max_ms
FROM picking_libre_audit_log
WHERE duration_ms IS NOT NULL
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY event_type
ORDER BY p95_ms DESC;

-- ================================================
-- 9. SESIONES POR USUARIO (últimas 7 días)
-- ================================================
SELECT 
  created_by_name,
  COUNT(*) as total_sesiones,
  COUNT(*) FILTER (WHERE status = 'completado') as completadas,
  COUNT(*) FILTER (WHERE status = 'cancelado') as canceladas,
  COUNT(*) FILTER (WHERE status = 'escaneando') as activas,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completado') / COUNT(*), 2) as tasa_completado_pct
FROM picking_libre_sessions
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY created_by_name
ORDER BY total_sesiones DESC
LIMIT 20;

-- ================================================
-- 10. STOCK CONSISTENCY CHECK
-- ================================================
-- Valida que stock reservado = stock en sesiones activas
SELECT 
  s.sku,
  v.description,
  SUM(s.reservado) as reservado_en_stock,
  COALESCE(SUM(i.quantity), 0) as en_sesiones_activas,
  SUM(s.reservado) - COALESCE(SUM(i.quantity), 0) as diferencia
FROM stockxbin s
JOIN variants v ON v.sku = s.sku
LEFT JOIN picking_libre_items i ON i.sku = s.sku
LEFT JOIN picking_libre_sessions ps ON ps.id = i.session_id
  AND ps.status IN ('escaneando', 'emitiendo')
WHERE s.reservado > 0
GROUP BY s.sku, v.description
HAVING SUM(s.reservado) != COALESCE(SUM(i.quantity), 0)
ORDER BY ABS(diferencia) DESC;

-- ================================================
-- 11. SESIONES CON RETRY_COUNT > 0 (últimas 7 días)
-- ================================================
SELECT 
  id,
  created_by_name,
  status,
  retry_count,
  last_error,
  created_at,
  completed_at
FROM picking_libre_sessions
WHERE retry_count > 0
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY retry_count DESC, created_at DESC
LIMIT 50;

-- ================================================
-- 12. ESTADÍSTICAS DE ZOMBIE RECOVERY
-- ================================================
SELECT * FROM get_zombie_sessions_stats();

-- ================================================
-- 13. ALERTA: Sesiones en 'emitiendo' hace >5 min
-- ================================================
SELECT 
  id,
  created_by_name,
  documento_tipo,
  EXTRACT(EPOCH FROM (NOW() - last_activity_at)) / 60 as minutos_en_emitiendo,
  retry_count,
  last_error
FROM picking_libre_sessions
WHERE status = 'emitiendo'
  AND last_activity_at < NOW() - INTERVAL '5 minutes'
ORDER BY last_activity_at ASC;

-- ================================================
-- 14. ALERTA: Tasa de error >5% en última hora
-- ================================================
WITH recent_emissions AS (
  SELECT 
    COUNT(*) FILTER (WHERE status = 'failed') as fallidas,
    COUNT(*) as total
  FROM picking_libre_emissions
  WHERE created_at > NOW() - INTERVAL '1 hour'
)
SELECT 
  fallidas,
  total,
  ROUND(100.0 * fallidas / NULLIF(total, 0), 2) as tasa_error_pct,
  CASE 
    WHEN (100.0 * fallidas / NULLIF(total, 0)) > 5 THEN '🚨 ALERTA'
    ELSE '✅ OK'
  END as estado
FROM recent_emissions
WHERE total > 0;

-- ================================================
-- 15. TOP PRODUCTOS MÁS ESCANEADOS (últimas 7 días)
-- ================================================
SELECT 
  i.sku,
  v.description as producto,
  COUNT(DISTINCT i.session_id) as sesiones,
  SUM(i.quantity) as total_escaneado,
  COUNT(*) as veces_escaneado
FROM picking_libre_items i
JOIN variants v ON v.sku = i.sku
JOIN picking_libre_sessions s ON s.id = i.session_id
WHERE s.created_at > NOW() - INTERVAL '7 days'
GROUP BY i.sku, v.description
ORDER BY total_escaneado DESC
LIMIT 20;
