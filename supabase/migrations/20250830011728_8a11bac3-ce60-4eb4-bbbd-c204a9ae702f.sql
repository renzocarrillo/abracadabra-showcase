-- Create function to calculate en_existencia
CREATE OR REPLACE FUNCTION public.calculate_en_existencia()
RETURNS TRIGGER AS $$
BEGIN
    NEW.en_existencia = COALESCE(NEW.disponibles, 0) + COALESCE(NEW.comprometido, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically calculate en_existencia on insert/update
CREATE TRIGGER trigger_calculate_en_existencia
    BEFORE INSERT OR UPDATE ON public.stockxbin
    FOR EACH ROW
    EXECUTE FUNCTION public.calculate_en_existencia();

-- Update existing records to calculate en_existencia
UPDATE public.stockxbin 
SET en_existencia = COALESCE(disponibles, 0) + COALESCE(comprometido, 0);