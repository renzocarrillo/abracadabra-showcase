-- Crear enum para estados de venta
CREATE TYPE public.venta_estado AS ENUM ('pendiente', 'en_picking', 'preparada', 'documento_emitido', 'despachada', 'cancelada');

-- Crear enum para tipos de documento
CREATE TYPE public.documento_tipo AS ENUM ('factura', 'boleta', 'ticket');

-- Crear tabla principal de ventas
CREATE TABLE public.ventas (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    venta_id TEXT NOT NULL UNIQUE,
    estado venta_estado NOT NULL DEFAULT 'pendiente',
    cliente_info JSONB NOT NULL,
    envio_info JSONB NOT NULL,
    documento_tipo documento_tipo,
    guia_remision BOOLEAN NOT NULL DEFAULT false,
    transportista_id UUID REFERENCES public.transportistas(id),
    metodo_pago TEXT NOT NULL DEFAULT 'efectivo',
    notas TEXT,
    subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
    igv NUMERIC(10,2) NOT NULL DEFAULT 0,
    total NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Crear tabla de detalles de venta
CREATE TABLE public.ventas_detalle (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    venta_id UUID NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    nombre_producto TEXT NOT NULL,
    variante TEXT,
    cantidad INTEGER NOT NULL,
    precio_unitario NUMERIC(10,2) NOT NULL,
    valor_unitario NUMERIC(10,2) NOT NULL,
    subtotal_linea NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Crear tabla de asignaciones de stock para ventas
CREATE TABLE public.ventas_asignaciones (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    venta_id UUID NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
    venta_detalle_id UUID NOT NULL REFERENCES public.ventas_detalle(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    bin TEXT NOT NULL,
    cantidad_asignada INTEGER NOT NULL,
    stock_id UUID NOT NULL REFERENCES public.stockxbin(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS en todas las tablas
ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas_detalle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas_asignaciones ENABLE ROW LEVEL SECURITY;

-- Crear políticas RLS
CREATE POLICY "Usuarios autenticados pueden leer ventas" 
ON public.ventas FOR SELECT 
USING (true);

CREATE POLICY "Usuarios autenticados pueden insertar ventas" 
ON public.ventas FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar ventas" 
ON public.ventas FOR UPDATE 
USING (true);

CREATE POLICY "Usuarios autenticados pueden leer ventas_detalle" 
ON public.ventas_detalle FOR SELECT 
USING (true);

CREATE POLICY "Usuarios autenticados pueden insertar ventas_detalle" 
ON public.ventas_detalle FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar ventas_detalle" 
ON public.ventas_detalle FOR UPDATE 
USING (true);

CREATE POLICY "Usuarios autenticados pueden leer ventas_asignaciones" 
ON public.ventas_asignaciones FOR SELECT 
USING (true);

CREATE POLICY "Usuarios autenticados pueden insertar ventas_asignaciones" 
ON public.ventas_asignaciones FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar ventas_asignaciones" 
ON public.ventas_asignaciones FOR UPDATE 
USING (true);

-- Crear función para asignar bins a una venta
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
    -- Loop through each item in the sale
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

-- Crear trigger para actualizar updated_at en ventas
CREATE TRIGGER update_ventas_updated_at
    BEFORE UPDATE ON public.ventas
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ventas_detalle_updated_at
    BEFORE UPDATE ON public.ventas_detalle
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Crear índices para mejor rendimiento
CREATE INDEX idx_ventas_venta_id ON public.ventas(venta_id);
CREATE INDEX idx_ventas_estado ON public.ventas(estado);
CREATE INDEX idx_ventas_detalle_venta_id ON public.ventas_detalle(venta_id);
CREATE INDEX idx_ventas_detalle_sku ON public.ventas_detalle(sku);
CREATE INDEX idx_ventas_asignaciones_venta_id ON public.ventas_asignaciones(venta_id);
CREATE INDEX idx_ventas_asignaciones_stock_id ON public.ventas_asignaciones(stock_id);