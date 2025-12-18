-- Create helper function to check if user is admin or supervisor
CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    LEFT JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = user_id
    AND (
      -- New permission system: admin or supervisor
      ut.is_admin = true 
      OR ut.name = 'supervisor'
      -- Old role system: admin
      OR p.role = 'admin'
    )
  );
$$;

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can read stock receptions" ON stock_receptions;
DROP POLICY IF EXISTS "Authenticated users can read stock consumptions" ON stock_consumptions;

-- Create restrictive policies for stock_receptions
CREATE POLICY "Only admins and supervisors can read stock receptions"
ON stock_receptions FOR SELECT
TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));

-- Create restrictive policies for stock_consumptions
CREATE POLICY "Only admins and supervisors can read stock consumptions"
ON stock_consumptions FOR SELECT
TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));