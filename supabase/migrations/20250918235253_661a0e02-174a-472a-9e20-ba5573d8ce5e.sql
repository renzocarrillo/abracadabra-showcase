-- Allow all authenticated users to read stock totals
CREATE POLICY "Authenticated users can read stock totals"
ON public.stock_totals
FOR SELECT
TO authenticated
USING (true);