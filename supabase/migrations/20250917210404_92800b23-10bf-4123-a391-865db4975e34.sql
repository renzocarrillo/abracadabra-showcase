-- Crear índices básicos para optimizar búsquedas
-- Habilitar extensión pg_trgm si no está habilitada (para búsquedas similares)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Índice específico para SKU en variants (búsqueda exacta)
CREATE INDEX IF NOT EXISTS idx_variants_sku ON variants (sku);

-- Índice específico para nombre de producto en variants
CREATE INDEX IF NOT EXISTS idx_variants_nombre ON variants ("nombreProducto");

-- Índice para variante en variants
CREATE INDEX IF NOT EXISTS idx_variants_variante ON variants (variante);

-- Índice para SKU en stock_totals (para joins rápidos)
CREATE INDEX IF NOT EXISTS idx_stock_totals_sku ON stock_totals (sku);

-- Índice para SKU en stockxbin (para búsquedas de ubicación)
CREATE INDEX IF NOT EXISTS idx_stockxbin_sku ON stockxbin (sku);

-- Índice compuesto para búsqueda de texto en variants
CREATE INDEX IF NOT EXISTS idx_variants_text_search ON variants USING gin(
  ("nombreProducto" || ' ' || sku || COALESCE(' ' || variante, '')) gin_trgm_ops
);