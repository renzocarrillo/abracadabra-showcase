-- Create inventory summary table
CREATE TABLE public.inventory_summary (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "idBsale" TEXT NOT NULL,
    sku TEXT NOT NULL,
    "cantidadTotal" INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE("idBsale", sku)
);

-- Enable RLS
ALTER TABLE public.inventory_summary ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow read access to inventory_summary" 
ON public.inventory_summary 
FOR SELECT 
USING (true);

CREATE POLICY "Allow insert inventory_summary" 
ON public.inventory_summary 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow update inventory_summary" 
ON public.inventory_summary 
FOR UPDATE 
USING (true);

-- Function to refresh inventory summary for a specific SKU
CREATE OR REPLACE FUNCTION public.refresh_inventory_summary_for_sku(target_sku TEXT)
RETURNS VOID AS $$
BEGIN
    -- Delete existing record for this SKU
    DELETE FROM public.inventory_summary 
    WHERE sku = target_sku;
    
    -- Insert new aggregated data
    INSERT INTO public.inventory_summary ("idBsale", sku, "cantidadTotal")
    SELECT 
        "idBsale",
        sku,
        COALESCE(SUM(COALESCE(en_existencia, 0)), 0) as "cantidadTotal"
    FROM public.stockxbin 
    WHERE sku = target_sku
    AND sku IS NOT NULL
    GROUP BY "idBsale", sku;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Function to refresh entire inventory summary
CREATE OR REPLACE FUNCTION public.refresh_inventory_summary()
RETURNS VOID AS $$
BEGIN
    -- Clear existing data
    TRUNCATE public.inventory_summary;
    
    -- Insert aggregated data from stockxbin
    INSERT INTO public.inventory_summary ("idBsale", sku, "cantidadTotal")
    SELECT 
        "idBsale",
        sku,
        COALESCE(SUM(COALESCE(en_existencia, 0)), 0) as "cantidadTotal"
    FROM public.stockxbin 
    WHERE sku IS NOT NULL
    GROUP BY "idBsale", sku;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger function to update inventory summary when stockxbin changes
CREATE OR REPLACE FUNCTION public.update_inventory_summary_trigger()
RETURNS TRIGGER AS $$
DECLARE
    affected_sku TEXT;
BEGIN
    -- Determine which SKU was affected
    IF TG_OP = 'DELETE' THEN
        affected_sku := OLD.sku;
    ELSE
        affected_sku := NEW.sku;
    END IF;
    
    -- Only process if SKU is not null
    IF affected_sku IS NOT NULL THEN
        -- Refresh inventory summary for this SKU
        PERFORM public.refresh_inventory_summary_for_sku(affected_sku);
        
        -- If this was an UPDATE and the SKU changed, also refresh the old SKU
        IF TG_OP = 'UPDATE' AND OLD.sku IS DISTINCT FROM NEW.sku AND OLD.sku IS NOT NULL THEN
            PERFORM public.refresh_inventory_summary_for_sku(OLD.sku);
        END IF;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger on stockxbin
CREATE TRIGGER trigger_update_inventory_summary
    AFTER INSERT OR UPDATE OR DELETE ON public.stockxbin
    FOR EACH ROW
    EXECUTE FUNCTION public.update_inventory_summary_trigger();

-- Add updated_at trigger for inventory_summary
CREATE TRIGGER update_inventory_summary_updated_at
    BEFORE UPDATE ON public.inventory_summary
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Populate initial data
SELECT public.refresh_inventory_summary();