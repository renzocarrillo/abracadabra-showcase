-- Create stock_totals table for aggregated stock data
CREATE TABLE public.stock_totals (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    sku TEXT NOT NULL UNIQUE,
    total_disponible INTEGER NOT NULL DEFAULT 0,
    total_comprometido INTEGER NOT NULL DEFAULT 0,
    total_en_existencia INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create clean pedidos table
CREATE TABLE public.pedidos (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    pedido_id TEXT NOT NULL UNIQUE,
    tienda_id UUID REFERENCES public.tiendas(id),
    tienda_nombre TEXT,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    total_items INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create pedidos_detalle table
CREATE TABLE public.pedidos_detalle (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    nombre_producto TEXT NOT NULL,
    variante TEXT,
    cantidad_solicitada INTEGER NOT NULL,
    cantidad_asignada INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create pedidos_asignaciones table
CREATE TABLE public.pedidos_asignaciones (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
    pedido_detalle_id UUID NOT NULL REFERENCES public.pedidos_detalle(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    bin TEXT NOT NULL,
    cantidad_asignada INTEGER NOT NULL,
    stock_id UUID NOT NULL REFERENCES public.stockxbin(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.stock_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_detalle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_asignaciones ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for stock_totals
CREATE POLICY "Allow read access to stock_totals" ON public.stock_totals FOR SELECT USING (true);
CREATE POLICY "Allow insert stock_totals" ON public.stock_totals FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update stock_totals" ON public.stock_totals FOR UPDATE USING (true);

-- Create RLS policies for pedidos
CREATE POLICY "Allow read access to pedidos" ON public.pedidos FOR SELECT USING (true);
CREATE POLICY "Allow insert pedidos" ON public.pedidos FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update pedidos" ON public.pedidos FOR UPDATE USING (true);

-- Create RLS policies for pedidos_detalle
CREATE POLICY "Allow read access to pedidos_detalle" ON public.pedidos_detalle FOR SELECT USING (true);
CREATE POLICY "Allow insert pedidos_detalle" ON public.pedidos_detalle FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update pedidos_detalle" ON public.pedidos_detalle FOR UPDATE USING (true);

-- Create RLS policies for pedidos_asignaciones
CREATE POLICY "Allow read access to pedidos_asignaciones" ON public.pedidos_asignaciones FOR SELECT USING (true);
CREATE POLICY "Allow insert pedidos_asignaciones" ON public.pedidos_asignaciones FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update pedidos_asignaciones" ON public.pedidos_asignaciones FOR UPDATE USING (true);

-- Create function to refresh stock totals
CREATE OR REPLACE FUNCTION public.refresh_stock_totals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Delete existing totals
    DELETE FROM stock_totals;
    
    -- Insert aggregated stock data
    INSERT INTO stock_totals (sku, total_disponible, total_comprometido, total_en_existencia)
    SELECT 
        sku,
        COALESCE(SUM(disponibles), 0) as total_disponible,
        COALESCE(SUM(comprometido), 0) as total_comprometido,
        COALESCE(SUM(en_existencia), 0) as total_en_existencia
    FROM stockxbin 
    WHERE sku IS NOT NULL
    GROUP BY sku;
END;
$$;

-- Create trigger function to update stock_totals when stockxbin changes
CREATE OR REPLACE FUNCTION public.update_stock_totals_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    -- Handle INSERT and UPDATE
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        INSERT INTO stock_totals (sku, total_disponible, total_comprometido, total_en_existencia)
        SELECT 
            NEW.sku,
            COALESCE(SUM(disponibles), 0),
            COALESCE(SUM(comprometido), 0),
            COALESCE(SUM(en_existencia), 0)
        FROM stockxbin 
        WHERE sku = NEW.sku
        GROUP BY sku
        ON CONFLICT (sku) DO UPDATE SET
            total_disponible = EXCLUDED.total_disponible,
            total_comprometido = EXCLUDED.total_comprometido,
            total_en_existencia = EXCLUDED.total_en_existencia,
            updated_at = now();
    END IF;
    
    -- Handle DELETE or UPDATE with sku change
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.sku != NEW.sku) THEN
        INSERT INTO stock_totals (sku, total_disponible, total_comprometido, total_en_existencia)
        SELECT 
            OLD.sku,
            COALESCE(SUM(disponibles), 0),
            COALESCE(SUM(comprometido), 0),
            COALESCE(SUM(en_existencia), 0)
        FROM stockxbin 
        WHERE sku = OLD.sku
        GROUP BY sku
        ON CONFLICT (sku) DO UPDATE SET
            total_disponible = EXCLUDED.total_disponible,
            total_comprometido = EXCLUDED.total_comprometido,
            total_en_existencia = EXCLUDED.total_en_existencia,
            updated_at = now();
            
        -- If no records exist for this sku, delete from totals
        IF NOT EXISTS (SELECT 1 FROM stockxbin WHERE sku = OLD.sku) THEN
            DELETE FROM stock_totals WHERE sku = OLD.sku;
        END IF;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create trigger on stockxbin to update stock_totals
CREATE TRIGGER trigger_update_stock_totals
    AFTER INSERT OR UPDATE OR DELETE ON stockxbin
    FOR EACH ROW
    EXECUTE FUNCTION update_stock_totals_trigger();

-- Create function to assign bins to order
CREATE OR REPLACE FUNCTION public.assign_bins_to_order(order_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
        
        -- Find available stock for this SKU, ordered by disponibles DESC
        FOR stock_record IN 
            SELECT id, bin, disponibles, comprometido
            FROM stockxbin 
            WHERE sku = detail_record.sku AND disponibles > 0
            ORDER BY disponibles DESC
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
$$;

-- Create triggers for updated_at columns
CREATE TRIGGER update_stock_totals_updated_at
    BEFORE UPDATE ON public.stock_totals
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pedidos_updated_at
    BEFORE UPDATE ON public.pedidos
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pedidos_detalle_updated_at
    BEFORE UPDATE ON public.pedidos_detalle
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Initialize stock_totals with current data
SELECT public.refresh_stock_totals();