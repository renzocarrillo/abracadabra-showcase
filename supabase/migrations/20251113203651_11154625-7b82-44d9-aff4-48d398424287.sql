-- Corregir la función para manejar documento_tipo correctamente
CREATE OR REPLACE FUNCTION fix_specific_sales_stock(
  venta_codes TEXT[],
  dry_run BOOLEAN DEFAULT false
)
RETURNS TABLE (
  venta_codigo TEXT,
  productos_corregidos INTEGER,
  unidades_restadas INTEGER,
  resultado TEXT,
  detalles JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venta RECORD;
  v_detalle RECORD;
  v_stock RECORD;
  v_productos_corregidos INTEGER;
  v_unidades_restadas INTEGER;
  v_cantidad_a_restar INTEGER;
  v_disponibles_antes INTEGER;
  v_disponibles_despues INTEGER;
  v_detalles JSONB;
  v_productos_detalle JSONB;
BEGIN
  FOR v_venta IN (
    SELECT 
      v.id,
      v.venta_id,
      v.documento_tipo,
      v.created_at,
      v.estado
    FROM ventas v
    WHERE v.venta_id = ANY(venta_codes)
  )
  LOOP
    v_productos_corregidos := 0;
    v_unidades_restadas := 0;
    v_productos_detalle := '[]'::JSONB;
    
    RAISE NOTICE '';
    RAISE NOTICE '=== Procesando venta % (estado: %, tipo: %) ===', 
      v_venta.venta_id, 
      v_venta.estado,
      COALESCE(v_venta.documento_tipo::text, 'null');
    
    IF EXISTS (SELECT 1 FROM ventas_asignaciones WHERE venta_id = v_venta.id) THEN
      RAISE NOTICE '⚠️  Venta % YA TIENE asignaciones, saltando...', v_venta.venta_id;
      
      venta_codigo := v_venta.venta_id;
      productos_corregidos := 0;
      unidades_restadas := 0;
      resultado := 'SALTADA - Ya tiene asignaciones';
      detalles := jsonb_build_object(
        'mensaje', 'Esta venta ya tiene asignaciones en ventas_asignaciones'
      );
      RETURN NEXT;
      CONTINUE;
    END IF;
    
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
          RAISE WARNING '  ❌ SKU %: NO HAY STOCK DISPONIBLE', v_detalle.sku;
          
          v_productos_detalle := v_productos_detalle || jsonb_build_object(
            'sku', v_detalle.sku,
            'producto', v_detalle.nombre_producto,
            'cantidad_solicitada', v_detalle.cantidad,
            'cantidad_corregida', 0,
            'error', 'Sin stock disponible'
          );
          CONTINUE;
        END IF;
        
        v_cantidad_a_restar := LEAST(v_stock.disponibles, v_detalle.cantidad);
        RAISE WARNING '  ⚠️  SKU %: Stock parcial. Solicitado: %, Disponible: %', 
          v_detalle.sku, v_detalle.cantidad, v_stock.disponibles;
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
      
      IF NOT dry_run THEN
        UPDATE stockxbin
        SET 
          disponibles = GREATEST(0, disponibles - v_cantidad_a_restar),
          updated_at = NOW()
        WHERE id = v_stock.id;
        
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
          corrected_by,
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
          auth.uid(),
          format('Corrección manual específica: %s unidades de %s',
            v_cantidad_a_restar,
            v_detalle.nombre_producto)
        );
      END IF;
      
      v_productos_corregidos := v_productos_corregidos + 1;
      v_unidades_restadas := v_unidades_restadas + v_cantidad_a_restar;
      
      v_productos_detalle := v_productos_detalle || jsonb_build_object(
        'sku', v_detalle.sku,
        'producto', v_detalle.nombre_producto,
        'cantidad_corregida', v_cantidad_a_restar,
        'bin', v_stock.bin,
        'disponibles_antes', v_disponibles_antes,
        'disponibles_despues', v_disponibles_despues
      );
    END LOOP;
    
    venta_codigo := v_venta.venta_id;
    productos_corregidos := v_productos_corregidos;
    unidades_restadas := v_unidades_restadas;
    resultado := CASE 
      WHEN dry_run THEN 'DRY RUN - No aplicado' 
      ELSE 'CORREGIDO' 
    END;
    detalles := jsonb_build_object(
      'estado', v_venta.estado,
      'tipo_documento', v_venta.documento_tipo,
      'productos', v_productos_detalle
    );
    
    RETURN NEXT;
  END LOOP;
  
  FOR v_venta IN (
    SELECT unnest(venta_codes) as codigo
    EXCEPT
    SELECT venta_id FROM ventas WHERE venta_id = ANY(venta_codes)
  )
  LOOP
    venta_codigo := v_venta.codigo;
    productos_corregidos := 0;
    unidades_restadas := 0;
    resultado := 'NO ENCONTRADA';
    detalles := jsonb_build_object('mensaje', 'Esta venta no existe en el sistema');
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Ejecutar corrección para V1083 y V1084
SELECT * FROM fix_specific_sales_stock(
  venta_codes := ARRAY['V1083', 'V1084'],
  dry_run := false
);