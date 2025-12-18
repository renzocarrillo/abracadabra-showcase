-- Crear tabla para registrar correcciones históricas de stock
CREATE TABLE IF NOT EXISTS historical_stock_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id UUID NOT NULL,
  venta_codigo TEXT NOT NULL,
  sku TEXT NOT NULL,
  cantidad_corregida INTEGER NOT NULL,
  bin_corregido TEXT NOT NULL,
  stock_id UUID NOT NULL,
  disponibles_antes INTEGER NOT NULL,
  disponibles_despues INTEGER NOT NULL,
  tipo_documento TEXT,
  fecha_venta TIMESTAMPTZ,
  corrected_at TIMESTAMPTZ DEFAULT NOW(),
  corrected_by UUID REFERENCES auth.users(id),
  notes TEXT
);

-- Habilitar RLS
ALTER TABLE historical_stock_corrections ENABLE ROW LEVEL SECURITY;

-- Política: Solo admins pueden ver las correcciones
CREATE POLICY "Admins can read stock corrections"
  ON historical_stock_corrections
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Política: Solo sistema puede insertar correcciones
CREATE POLICY "System can insert stock corrections"
  ON historical_stock_corrections
  FOR INSERT
  WITH CHECK (true);

-- Función principal de corrección retroactiva
CREATE OR REPLACE FUNCTION fix_historical_stock_consumption(
  dry_run BOOLEAN DEFAULT true,
  limit_ventas INTEGER DEFAULT NULL
)
RETURNS TABLE (
  total_ventas_corregidas INTEGER,
  total_productos_corregidos INTEGER,
  total_unidades_restadas INTEGER,
  ventas_con_errores INTEGER,
  detalles JSONB
) 
LANGUAGE plpgsql
AS $$
DECLARE
  v_venta RECORD;
  v_detalle RECORD;
  v_stock RECORD;
  v_ventas_procesadas INTEGER := 0;
  v_productos_corregidos INTEGER := 0;
  v_unidades_restadas INTEGER := 0;
  v_ventas_con_errores INTEGER := 0;
  v_cantidad_a_restar INTEGER;
  v_disponibles_antes INTEGER;
  v_disponibles_despues INTEGER;
  v_correction_details JSONB := '[]'::JSONB;
  v_venta_detail JSONB;
BEGIN
  -- Log inicio del proceso
  RAISE NOTICE '=== INICIANDO CORRECCIÓN HISTÓRICA DE STOCK ===';
  RAISE NOTICE 'Modo: %', CASE WHEN dry_run THEN 'DRY RUN (no se aplicarán cambios)' ELSE 'EJECUCIÓN REAL' END;
  
  -- Buscar ventas archivadas sin asignaciones
  FOR v_venta IN (
    SELECT 
      v.id,
      v.venta_id,
      v.documento_tipo,
      v.created_at,
      v.total
    FROM ventas v
    WHERE v.estado = 'archivado'
    AND NOT EXISTS (
      SELECT 1 FROM ventas_asignaciones va
      WHERE va.venta_id = v.id
    )
    ORDER BY v.created_at DESC
    LIMIT COALESCE(limit_ventas, 999999)
  )
  LOOP
    v_ventas_procesadas := v_ventas_procesadas + 1;
    v_venta_detail := jsonb_build_object(
      'venta_id', v_venta.venta_id,
      'documento_tipo', v_venta.documento_tipo,
      'fecha', v_venta.created_at,
      'productos', '[]'::JSONB
    );
    
    RAISE NOTICE '';
    RAISE NOTICE '--- Procesando venta % (tipo: %, fecha: %) ---', 
      v_venta.venta_id, 
      COALESCE(v_venta.documento_tipo, 'sin tipo'),
      v_venta.created_at;
    
    -- Procesar cada detalle de la venta
    FOR v_detalle IN (
      SELECT 
        vd.id,
        vd.sku,
        vd.cantidad,
        vd.nombre_producto,
        vd.variante
      FROM ventas_detalle vd
      WHERE vd.venta_id = v_venta.id
      ORDER BY vd.sku
    )
    LOOP
      -- Buscar stock disponible para este SKU (ordenado por disponibles DESC)
      SELECT 
        s.id,
        s.bin,
        s.disponibles,
        s.sku
      INTO v_stock
      FROM stockxbin s
      WHERE s.sku = v_detalle.sku
      AND s.disponibles >= v_detalle.cantidad
      ORDER BY s.disponibles DESC
      LIMIT 1;
      
      IF v_stock.id IS NULL THEN
        -- No hay stock suficiente en un solo bin, intentar con el que tenga más
        SELECT 
          s.id,
          s.bin,
          s.disponibles,
          s.sku
        INTO v_stock
        FROM stockxbin s
        WHERE s.sku = v_detalle.sku
        AND s.disponibles > 0
        ORDER BY s.disponibles DESC
        LIMIT 1;
        
        IF v_stock.id IS NULL THEN
          RAISE WARNING '  ⚠️  SKU % (producto: %): NO HAY STOCK DISPONIBLE para restar % unidades',
            v_detalle.sku,
            v_detalle.nombre_producto,
            v_detalle.cantidad;
          v_ventas_con_errores := v_ventas_con_errores + 1;
          CONTINUE;
        END IF;
        
        -- Restar solo lo disponible
        v_cantidad_a_restar := LEAST(v_stock.disponibles, v_detalle.cantidad);
        RAISE WARNING '  ⚠️  SKU %: Stock insuficiente. Solicitado: %, Disponible: %, Se restará: %',
          v_detalle.sku,
          v_detalle.cantidad,
          v_stock.disponibles,
          v_cantidad_a_restar;
      ELSE
        v_cantidad_a_restar := v_detalle.cantidad;
      END IF;
      
      v_disponibles_antes := v_stock.disponibles;
      v_disponibles_despues := v_disponibles_antes - v_cantidad_a_restar;
      
      RAISE NOTICE '  ✓ SKU %: Restando % unidades del bin % (disponibles: % → %)',
        v_detalle.sku,
        v_cantidad_a_restar,
        v_stock.bin,
        v_disponibles_antes,
        v_disponibles_despues;
      
      -- Si NO es dry run, aplicar la corrección
      IF NOT dry_run THEN
        -- Actualizar stock
        UPDATE stockxbin
        SET 
          disponibles = GREATEST(0, disponibles - v_cantidad_a_restar),
          updated_at = NOW()
        WHERE id = v_stock.id;
        
        -- Registrar corrección
        INSERT INTO historical_stock_corrections (
          venta_id,
          venta_codigo,
          sku,
          cantidad_corregida,
          bin_corregido,
          stock_id,
          disponibles_antes,
          disponibles_despues,
          tipo_documento,
          fecha_venta,
          notes
        ) VALUES (
          v_venta.id,
          v_venta.venta_id,
          v_detalle.sku,
          v_cantidad_a_restar,
          v_stock.bin,
          v_stock.id,
          v_disponibles_antes,
          v_disponibles_despues,
          v_venta.documento_tipo,
          v_venta.created_at,
          format('Corrección retroactiva: venta sin asignaciones consumió %s unidades de %s',
            v_cantidad_a_restar,
            v_detalle.nombre_producto)
        );
      END IF;
      
      -- Acumular estadísticas
      v_productos_corregidos := v_productos_corregidos + 1;
      v_unidades_restadas := v_unidades_restadas + v_cantidad_a_restar;
      
      -- Agregar al detalle JSON
      v_venta_detail := jsonb_set(
        v_venta_detail,
        '{productos}',
        (v_venta_detail->'productos') || jsonb_build_object(
          'sku', v_detalle.sku,
          'producto', v_detalle.nombre_producto,
          'cantidad_corregida', v_cantidad_a_restar,
          'bin', v_stock.bin
        )
      );
    END LOOP;
    
    -- Agregar venta a detalles si tuvo correcciones
    IF jsonb_array_length(v_venta_detail->'productos') > 0 THEN
      v_correction_details := v_correction_details || v_venta_detail;
    END IF;
  END LOOP;
  
  -- Log resumen
  RAISE NOTICE '';
  RAISE NOTICE '=== RESUMEN DE CORRECCIÓN ===';
  RAISE NOTICE 'Ventas procesadas: %', v_ventas_procesadas;
  RAISE NOTICE 'Productos corregidos: %', v_productos_corregidos;
  RAISE NOTICE 'Unidades restadas: %', v_unidades_restadas;
  RAISE NOTICE 'Ventas con errores: %', v_ventas_con_errores;
  RAISE NOTICE 'Modo: %', CASE WHEN dry_run THEN 'DRY RUN' ELSE 'APLICADO' END;
  
  -- Retornar resultados
  RETURN QUERY SELECT 
    v_ventas_procesadas,
    v_productos_corregidos,
    v_unidades_restadas,
    v_ventas_con_errores,
    v_correction_details;
END;
$$;

-- Función auxiliar para ver el impacto sin aplicar cambios
CREATE OR REPLACE FUNCTION preview_stock_corrections(limit_ventas INTEGER DEFAULT 10)
RETURNS TABLE (
  venta_codigo TEXT,
  documento_tipo TEXT,
  fecha_venta TIMESTAMPTZ,
  sku TEXT,
  producto TEXT,
  cantidad INTEGER,
  bin_sugerido TEXT,
  disponibles_actual INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.venta_id,
    v.documento_tipo,
    v.created_at,
    vd.sku,
    vd.nombre_producto,
    vd.cantidad,
    (
      SELECT s.bin
      FROM stockxbin s
      WHERE s.sku = vd.sku
      AND s.disponibles >= vd.cantidad
      ORDER BY s.disponibles DESC
      LIMIT 1
    ),
    (
      SELECT s.disponibles
      FROM stockxbin s
      WHERE s.sku = vd.sku
      AND s.disponibles >= vd.cantidad
      ORDER BY s.disponibles DESC
      LIMIT 1
    )
  FROM ventas v
  JOIN ventas_detalle vd ON vd.venta_id = v.id
  WHERE v.estado = 'archivado'
  AND NOT EXISTS (
    SELECT 1 FROM ventas_asignaciones va
    WHERE va.venta_id = v.id
  )
  ORDER BY v.created_at DESC
  LIMIT limit_ventas;
END;
$$;

COMMENT ON FUNCTION fix_historical_stock_consumption IS 
'Corrige retroactivamente el stock de ventas archivadas que no consumieron stock. 
Parámetros:
- dry_run: si es true, solo simula sin aplicar cambios (default: true)
- limit_ventas: limita el número de ventas a procesar (default: todas)';

COMMENT ON FUNCTION preview_stock_corrections IS
'Vista previa de las correcciones que se aplicarían, sin modificar datos';

COMMENT ON TABLE historical_stock_corrections IS
'Registro de todas las correcciones retroactivas aplicadas al stock por ventas sin asignaciones';