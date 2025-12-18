-- Allow forced inventory start when there is committed stock
-- 1) Replace validation function with an optional force parameter
DROP FUNCTION IF EXISTS public.check_bin_can_start_inventory(text);
CREATE OR REPLACE FUNCTION public.check_bin_can_start_inventory(
  bin_code_param text,
  force_param boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  committed_stock INTEGER;
  active_orders jsonb := '[]'::jsonb;
  active_sales jsonb := '[]'::jsonb;
  bin_frozen BOOLEAN;
  existing_inventory UUID;
BEGIN
  -- Check if bin is already frozen
  SELECT is_frozen INTO bin_frozen 
  FROM bins 
  WHERE bin_code = bin_code_param;
  
  IF bin_frozen THEN
    RETURN jsonb_build_object(
      'can_start', false,
      'reason', 'bin_frozen',
      'message', 'El bin ya está congelado para inventario'
    );
  END IF;
  
  -- Check if there's already an active inventory for this bin
  SELECT id INTO existing_inventory
  FROM bin_inventories 
  WHERE bin_code = bin_code_param AND status = 'iniciado';
  
  IF existing_inventory IS NOT NULL THEN
    RETURN jsonb_build_object(
      'can_start', false,
      'reason', 'inventory_active',
      'message', 'Ya hay un inventario activo para este bin'
    );
  END IF;
  
  -- Check committed stock in this bin
  SELECT COALESCE(SUM(comprometido), 0) INTO committed_stock
  FROM stockxbin 
  WHERE bin = bin_code_param;
  
  IF committed_stock > 0 THEN
    -- Get active orders affecting this bin
    SELECT jsonb_agg(
      jsonb_build_object(
        'pedido_id', p.pedido_id,
        'estado', p.estado,
        'stock_comprometido', pa.cantidad_asignada,
        'sku', pa.sku
      )
    ) INTO active_orders
    FROM pedidos_asignaciones pa
    JOIN pedidos p ON pa.pedido_id = p.id
    WHERE pa.bin = bin_code_param 
      AND p.estado NOT IN ('archivado');
    
    -- Get active sales affecting this bin (using correct enum values)
    SELECT jsonb_agg(
      jsonb_build_object(
        'venta_id', v.venta_id,
        'estado', v.estado,
        'stock_comprometido', va.cantidad_asignada,
        'sku', va.sku
      )
    ) INTO active_sales
    FROM ventas_asignaciones va
    JOIN ventas v ON va.venta_id = v.id
    WHERE va.bin = bin_code_param 
      AND v.estado NOT IN ('archivado', 'cancelada', 'despachada');
    
    IF force_param THEN
      RETURN jsonb_build_object(
        'can_start', true,
        'reason', 'committed_stock_but_forced',
        'message', 'Inicio forzado con stock comprometido. Se recomienda procesar o archivar los documentos antes de continuar.',
        'committed_stock', committed_stock,
        'active_orders', COALESCE(active_orders, '[]'::jsonb),
        'active_sales', COALESCE(active_sales, '[]'::jsonb)
      );
    END IF;
    
    RETURN jsonb_build_object(
      'can_start', false,
      'reason', 'committed_stock',
      'message', 'Hay stock comprometido en este bin. Procese los pedidos/ventas primero.',
      'committed_stock', committed_stock,
      'active_orders', COALESCE(active_orders, '[]'::jsonb),
      'active_sales', COALESCE(active_sales, '[]'::jsonb)
    );
  END IF;
  
  RETURN jsonb_build_object(
    'can_start', true,
    'message', 'El bin puede ser inventariado'
  );
END;
$function$;

-- 2) Replace start function to accept force flag and pass it to validation
CREATE OR REPLACE FUNCTION public.start_bin_inventory(
  bin_code_param text,
  started_by_param uuid,
  started_by_name_param text,
  notes_param text DEFAULT NULL::text,
  force_param boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  validation_result jsonb;
  inventory_id uuid;
BEGIN
  -- Validate if inventory can be started (support force)
  SELECT check_bin_can_start_inventory(bin_code_param, force_param) INTO validation_result;
  
  IF NOT (validation_result->>'can_start')::boolean THEN
    RETURN validation_result;
  END IF;
  
  -- Freeze the bin
  UPDATE bins 
  SET 
    is_frozen = true,
    frozen_by = started_by_param,
    frozen_reason = 'Inventario en proceso',
    frozen_at = now(),
    updated_at = now()
  WHERE bin_code = bin_code_param;
  
  -- Create inventory record
  INSERT INTO bin_inventories (
    bin_code, 
    started_by, 
    started_by_name, 
    notes
  ) VALUES (
    bin_code_param, 
    started_by_param, 
    started_by_name_param, 
    notes_param
  ) RETURNING id INTO inventory_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'inventory_id', inventory_id,
    'message', 'Inventario iniciado correctamente'
  );
END;
$function$;