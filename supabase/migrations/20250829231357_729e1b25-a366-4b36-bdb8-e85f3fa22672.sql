-- Enable RLS on pedidos2.0 table
ALTER TABLE "pedidos2.0" ENABLE ROW LEVEL SECURITY;

-- Create policies for read access to pedidos2.0
CREATE POLICY "Allow read access to pedidos2.0" 
ON "pedidos2.0" 
FOR SELECT 
USING (true);

-- Create policies for insert access to pedidos2.0
CREATE POLICY "Allow insert pedidos2.0" 
ON "pedidos2.0" 
FOR INSERT 
WITH CHECK (true);

-- Create policies for update access to pedidos2.0
CREATE POLICY "Allow update pedidos2.0" 
ON "pedidos2.0" 
FOR UPDATE 
USING (true);