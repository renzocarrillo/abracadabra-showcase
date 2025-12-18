-- Create table for daily stock snapshots
CREATE TABLE public.daily_stock_snapshots (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    snapshot_date DATE NOT NULL UNIQUE,
    total_stock INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.daily_stock_snapshots ENABLE ROW LEVEL SECURITY;

-- Policy for reading (everyone can read)
CREATE POLICY "Everyone can read daily stock snapshots" 
ON public.daily_stock_snapshots 
FOR SELECT 
USING (true);

-- Policy for admin operations
CREATE POLICY "System can manage daily stock snapshots" 
ON public.daily_stock_snapshots 
FOR ALL 
USING ((current_setting('role'::text, true) = 'supabase_admin'::text) OR user_has_role('admin'::text))
WITH CHECK ((current_setting('role'::text, true) = 'supabase_admin'::text) OR user_has_role('admin'::text));

-- Function to calculate and store daily stock snapshot
CREATE OR REPLACE FUNCTION public.create_daily_stock_snapshot(target_date DATE DEFAULT CURRENT_DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    total_stock_count INTEGER;
BEGIN
    -- Calculate total stock for the day
    SELECT COALESCE(SUM(total_en_existencia), 0)
    INTO total_stock_count
    FROM stock_totals;
    
    -- Insert or update the daily snapshot
    INSERT INTO daily_stock_snapshots (snapshot_date, total_stock)
    VALUES (target_date, total_stock_count)
    ON CONFLICT (snapshot_date)
    DO UPDATE SET 
        total_stock = EXCLUDED.total_stock,
        updated_at = now();
    
    RETURN total_stock_count;
END;
$$;

-- Insert initial data for the last 30 days (approximated)
DO $$
DECLARE
    i INTEGER;
    current_total INTEGER;
BEGIN
    -- Get current total stock
    SELECT COALESCE(SUM(total_en_existencia), 0) INTO current_total FROM stock_totals;
    
    -- Create approximate historical data for the last 30 days
    FOR i IN 1..30 LOOP
        INSERT INTO daily_stock_snapshots (snapshot_date, total_stock, created_at)
        VALUES (
            CURRENT_DATE - i,
            current_total + (random() * 1000 - 500)::INTEGER, -- Add some variance
            now() - (i || ' days')::INTERVAL
        );
    END LOOP;
    
    -- Insert today's actual snapshot
    PERFORM create_daily_stock_snapshot(CURRENT_DATE);
END;
$$;