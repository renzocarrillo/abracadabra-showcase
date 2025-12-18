-- Reset all stock to zero for inventory
UPDATE stockxbin 
SET 
  disponibles = 0,
  comprometido = 0,
  en_existencia = 0,
  updated_at = now();

-- Refresh stock totals to reflect the changes
SELECT refresh_stock_totals();