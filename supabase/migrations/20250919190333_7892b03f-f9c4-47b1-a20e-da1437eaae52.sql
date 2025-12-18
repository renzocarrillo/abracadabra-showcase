-- Create inventory status enum
CREATE TYPE public.inventory_status AS ENUM ('iniciado', 'finalizado');

-- Add freezing fields to bins table
ALTER TABLE public.bins 
ADD COLUMN is_frozen boolean DEFAULT false,
ADD COLUMN frozen_by uuid REFERENCES public.profiles(id),
ADD COLUMN frozen_reason text,
ADD COLUMN frozen_at timestamp with time zone;

-- Create bin inventories table
CREATE TABLE public.bin_inventories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bin_code text NOT NULL REFERENCES public.bins(bin_code),
  status public.inventory_status NOT NULL DEFAULT 'iniciado',
  started_by uuid NOT NULL REFERENCES public.profiles(id),
  started_by_name text NOT NULL,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  finished_by uuid REFERENCES public.profiles(id),
  finished_by_name text,
  finished_at timestamp with time zone,
  notes text,
  report_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create inventory changes table
CREATE TABLE public.inventory_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid NOT NULL REFERENCES public.bin_inventories(id) ON DELETE CASCADE,
  stock_id uuid NOT NULL REFERENCES public.stockxbin(id),
  sku text NOT NULL,
  nombre_producto text NOT NULL,
  variante text,
  previous_quantity integer NOT NULL,
  new_quantity integer NOT NULL,
  difference integer NOT NULL,
  change_type text NOT NULL CHECK (change_type IN ('increase', 'decrease', 'no_change')),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.bin_inventories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_changes ENABLE ROW LEVEL SECURITY;

-- RLS policies for bin_inventories
CREATE POLICY "Authorized users can read bin inventories" 
ON public.bin_inventories 
FOR SELECT 
USING (
  user_has_role('admin'::text) OR 
  user_has_permission('manage_inventory'::text) OR
  (EXISTS (
    SELECT 1 FROM public.profiles p 
    JOIN public.user_types ut ON p.user_type_id = ut.id 
    WHERE p.id = auth.uid() AND ut.name IN ('supervisor', 'admin')
  ))
);

CREATE POLICY "Authorized users can manage bin inventories" 
ON public.bin_inventories 
FOR ALL 
USING (
  user_has_role('admin'::text) OR 
  user_has_permission('manage_inventory'::text) OR
  (EXISTS (
    SELECT 1 FROM public.profiles p 
    JOIN public.user_types ut ON p.user_type_id = ut.id 
    WHERE p.id = auth.uid() AND ut.name IN ('supervisor', 'admin')
  ))
)
WITH CHECK (
  user_has_role('admin'::text) OR 
  user_has_permission('manage_inventory'::text) OR
  (EXISTS (
    SELECT 1 FROM public.profiles p 
    JOIN public.user_types ut ON p.user_type_id = ut.id 
    WHERE p.id = auth.uid() AND ut.name IN ('supervisor', 'admin')
  ))
);

-- RLS policies for inventory_changes
CREATE POLICY "Authorized users can read inventory changes" 
ON public.inventory_changes 
FOR SELECT 
USING (
  user_has_role('admin'::text) OR 
  user_has_permission('manage_inventory'::text) OR
  (EXISTS (
    SELECT 1 FROM public.profiles p 
    JOIN public.user_types ut ON p.user_type_id = ut.id 
    WHERE p.id = auth.uid() AND ut.name IN ('supervisor', 'admin')
  ))
);

CREATE POLICY "Authorized users can manage inventory changes" 
ON public.inventory_changes 
FOR ALL 
USING (
  user_has_role('admin'::text) OR 
  user_has_permission('manage_inventory'::text) OR
  (EXISTS (
    SELECT 1 FROM public.profiles p 
    JOIN public.user_types ut ON p.user_type_id = ut.id 
    WHERE p.id = auth.uid() AND ut.name IN ('supervisor', 'admin')
  ))
)
WITH CHECK (
  user_has_role('admin'::text) OR 
  user_has_permission('manage_inventory'::text) OR
  (EXISTS (
    SELECT 1 FROM public.profiles p 
    JOIN public.user_types ut ON p.user_type_id = ut.id 
    WHERE p.id = auth.uid() AND ut.name IN ('supervisor', 'admin')
  ))
);

-- Function to check if bin can start inventory
CREATE OR REPLACE FUNCTION public.check_bin_can_start_inventory(bin_code_param text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      AND p.estado NOT IN ('archivado', 'completado');
    
    -- Get active sales affecting this bin
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
      AND v.estado NOT IN ('archivado', 'completado');
    
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
$$;

-- Function to start bin inventory
CREATE OR REPLACE FUNCTION public.start_bin_inventory(
  bin_code_param text,
  started_by_param uuid,
  started_by_name_param text,
  notes_param text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  validation_result jsonb;
  inventory_id uuid;
BEGIN
  -- Validate if inventory can be started
  SELECT check_bin_can_start_inventory(bin_code_param) INTO validation_result;
  
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
$$;

-- Function to finish bin inventory
CREATE OR REPLACE FUNCTION public.finish_bin_inventory(
  inventory_id_param uuid,
  finished_by_param uuid,
  finished_by_name_param text,
  changes_param jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inventory_record RECORD;
  change_record jsonb;
  stock_record RECORD;
  increases_count INTEGER := 0;
  decreases_count INTEGER := 0;
BEGIN
  -- Get inventory record
  SELECT * INTO inventory_record
  FROM bin_inventories 
  WHERE id = inventory_id_param AND status = 'iniciado';
  
  IF inventory_record IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Inventario no encontrado o ya finalizado'
    );
  END IF;
  
  -- Process each change
  FOR change_record IN SELECT * FROM jsonb_array_elements(changes_param)
  LOOP
    -- Get stock record
    SELECT * INTO stock_record
    FROM stockxbin 
    WHERE id = (change_record->>'stock_id')::uuid;
    
    IF stock_record IS NOT NULL THEN
      -- Insert change record
      INSERT INTO inventory_changes (
        inventory_id,
        stock_id,
        sku,
        nombre_producto,
        variante,
        previous_quantity,
        new_quantity,
        difference,
        change_type
      ) VALUES (
        inventory_id_param,
        (change_record->>'stock_id')::uuid,
        change_record->>'sku',
        change_record->>'nombre_producto',
        change_record->>'variante',
        (change_record->>'previous_quantity')::integer,
        (change_record->>'new_quantity')::integer,
        (change_record->>'difference')::integer,
        change_record->>'change_type'
      );
      
      -- Count changes for summary
      IF (change_record->>'difference')::integer > 0 THEN
        increases_count := increases_count + 1;
      ELSIF (change_record->>'difference')::integer < 0 THEN
        decreases_count := decreases_count + 1;
      END IF;
    END IF;
  END LOOP;
  
  -- Update inventory record
  UPDATE bin_inventories 
  SET 
    status = 'finalizado',
    finished_by = finished_by_param,
    finished_by_name = finished_by_name_param,
    finished_at = now(),
    updated_at = now()
  WHERE id = inventory_id_param;
  
  -- Unfreeze the bin
  UPDATE bins 
  SET 
    is_frozen = false,
    frozen_by = NULL,
    frozen_reason = NULL,
    frozen_at = NULL,
    updated_at = now()
  WHERE bin_code = inventory_record.bin_code;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Inventario finalizado correctamente',
    'summary', jsonb_build_object(
      'increases', increases_count,
      'decreases', decreases_count,
      'total_changes', increases_count + decreases_count
    )
  );
END;
$$;

-- Add triggers for updated_at
CREATE TRIGGER update_bin_inventories_updated_at
  BEFORE UPDATE ON public.bin_inventories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Update existing functions to check bin freezing
CREATE OR REPLACE FUNCTION public.assign_bins_to_order(order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    detail_record RECORD;
    stock_record RECORD;
    remaining_quantity INTEGER;
    to_assign INTEGER;
BEGIN
    -- Loop through each item in the order
    FOR detail_record IN 
        SELECT id, sku, cantidad_solicitada, cantidad_asignada
        FROM pedidos_detalle 
        WHERE pedido_id = order_id
    LOOP
        remaining_quantity := detail_record.cantidad_solicitada - detail_record.cantidad_asignada;
        
        -- Skip if already fully assigned
        IF remaining_quantity <= 0 THEN
            CONTINUE;
        END IF;
        
        -- Find available stock for this SKU, excluding frozen bins
        FOR stock_record IN 
            SELECT s.id, s.bin, s.disponibles, s.comprometido
            FROM stockxbin s
            JOIN bins b ON s.bin = b.bin_code
            WHERE s.sku = detail_record.sku 
              AND s.disponibles > 0
              AND (b.is_frozen = false OR b.is_frozen IS NULL)
            ORDER BY s.disponibles DESC
        LOOP
            IF remaining_quantity <= 0 THEN
                EXIT;
            END IF;
            
            -- Calculate how much to assign from this bin
            to_assign := LEAST(stock_record.disponibles, remaining_quantity);
            
            -- Create assignment record
            INSERT INTO pedidos_asignaciones (
                pedido_id, 
                pedido_detalle_id, 
                sku, 
                bin, 
                cantidad_asignada, 
                stock_id
            ) VALUES (
                order_id,
                detail_record.id,
                detail_record.sku,
                stock_record.bin,
                to_assign,
                stock_record.id
            );
            
            -- Update stockxbin: move from disponibles to comprometido
            UPDATE stockxbin 
            SET 
                disponibles = disponibles - to_assign,
                comprometido = comprometido + to_assign,
                updated_at = now()
            WHERE id = stock_record.id;
            
            remaining_quantity := remaining_quantity - to_assign;
        END LOOP;
        
        -- Update cantidad_asignada in pedidos_detalle
        UPDATE pedidos_detalle 
        SET cantidad_asignada = cantidad_solicitada - remaining_quantity
        WHERE id = detail_record.id;
    END LOOP;
    
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assign_bins_to_sale(sale_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    detail_record RECORD;
    stock_record RECORD;
    remaining_quantity INTEGER;
    to_assign INTEGER;
BEGIN
    -- First, revert any existing assignments for this sale
    -- Move comprometido back to disponibles for existing assignments
    UPDATE stockxbin 
    SET 
        disponibles = disponibles + va.cantidad_asignada,
        comprometido = comprometido - va.cantidad_asignada,
        updated_at = now()
    FROM ventas_asignaciones va
    WHERE va.venta_id = sale_id 
      AND va.stock_id = stockxbin.id;
    
    -- Delete existing assignments for this sale
    DELETE FROM ventas_asignaciones WHERE venta_id = sale_id;
    
    -- Now create new assignments based on current ventas_detalle
    FOR detail_record IN 
        SELECT id, sku, cantidad
        FROM ventas_detalle 
        WHERE venta_id = sale_id
    LOOP
        remaining_quantity := detail_record.cantidad;
        
        -- Skip if no quantity needed
        IF remaining_quantity <= 0 THEN
            CONTINUE;
        END IF;
        
        -- Find available stock for this SKU, excluding frozen bins
        FOR stock_record IN 
            SELECT s.id, s.bin, s.disponibles, s.comprometido
            FROM stockxbin s
            JOIN bins b ON s.bin = b.bin_code
            WHERE s.sku = detail_record.sku 
              AND s.disponibles > 0
              AND (b.is_frozen = false OR b.is_frozen IS NULL)
            ORDER BY s.disponibles DESC
        LOOP
            IF remaining_quantity <= 0 THEN
                EXIT;
            END IF;
            
            -- Calculate how much to assign from this bin
            to_assign := LEAST(stock_record.disponibles, remaining_quantity);
            
            -- Create assignment record
            INSERT INTO ventas_asignaciones (
                venta_id, 
                venta_detalle_id, 
                sku, 
                bin, 
                cantidad_asignada, 
                stock_id
            ) VALUES (
                sale_id,
                detail_record.id,
                detail_record.sku,
                stock_record.bin,
                to_assign,
                stock_record.id
            );
            
            -- Update stockxbin: move from disponibles to comprometido
            UPDATE stockxbin 
            SET 
                disponibles = disponibles - to_assign,
                comprometido = comprometido + to_assign,
                updated_at = now()
            WHERE id = stock_record.id;
            
            remaining_quantity := remaining_quantity - to_assign;
        END LOOP;
    END LOOP;
    
    RETURN true;
END;
$function$;