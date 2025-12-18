-- Fix RLS policies for the variants table
-- Ensure RLS is enabled and policies exist
ALTER TABLE public.variants ENABLE ROW LEVEL SECURITY;

-- Recreate policies with proper configuration
DROP POLICY IF EXISTS "Allow read access to variants" ON public.variants;
DROP POLICY IF EXISTS "Allow insert variants" ON public.variants;
DROP POLICY IF EXISTS "Allow update variants" ON public.variants;

CREATE POLICY "Allow read access to variants" ON public.variants FOR SELECT USING (true);
CREATE POLICY "Allow insert variants" ON public.variants FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update variants" ON public.variants FOR UPDATE USING (true);