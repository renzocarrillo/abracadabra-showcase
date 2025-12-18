-- Fix search path for security
CREATE OR REPLACE FUNCTION public.calculate_en_existencia()
RETURNS TRIGGER AS $$
BEGIN
    NEW.en_existencia = COALESCE(NEW.disponibles, 0) + COALESCE(NEW.comprometido, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql 
SET search_path = 'public';