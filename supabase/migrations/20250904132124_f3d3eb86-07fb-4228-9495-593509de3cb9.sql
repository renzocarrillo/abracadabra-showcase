CREATE TRIGGER update_stock_consumptions_updated_at
BEFORE UPDATE ON public.stock_consumptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();