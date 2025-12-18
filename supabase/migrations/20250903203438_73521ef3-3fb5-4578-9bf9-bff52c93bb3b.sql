-- Rename the products table to variants
ALTER TABLE public.products RENAME TO variants;

-- Update any existing triggers that reference the old table name
-- (checking if there are any triggers that need updating)

-- Update any foreign key constraints or indexes that might reference the table
-- The table doesn't have foreign keys but we need to make sure everything is consistent

-- Update any RLS policies
DROP POLICY IF EXISTS "Allow read access to products" ON public.variants;
DROP POLICY IF EXISTS "Allow insert products" ON public.variants;
DROP POLICY IF EXISTS "Allow update products" ON public.variants;

CREATE POLICY "Allow read access to variants" ON public.variants FOR SELECT USING (true);
CREATE POLICY "Allow insert variants" ON public.variants FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update variants" ON public.variants FOR UPDATE USING (true);