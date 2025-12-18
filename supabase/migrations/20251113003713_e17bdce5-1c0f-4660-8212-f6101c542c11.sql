-- Add RLS policy to variants table to allow admins and supervisors to read product data
-- This is needed for the reconciliation page to show product names and variants

-- Enable RLS on variants table if not already enabled
ALTER TABLE variants ENABLE ROW LEVEL SECURITY;

-- Create policy for admins and supervisors to read variants data
CREATE POLICY "Admins and supervisors can read variants"
ON variants
FOR SELECT
TO authenticated
USING (
  user_has_role('admin'::text) 
  OR user_has_permission('view_reconciliation'::text)
  OR EXISTS (
    SELECT 1 FROM profiles p
    JOIN user_types ut ON p.user_type_id = ut.id
    WHERE p.id = auth.uid() 
    AND ut.name IN ('supervisor', 'admin')
  )
);

-- Add comment explaining the policy
COMMENT ON POLICY "Admins and supervisors can read variants" ON variants IS 
'Allows administrators, supervisors, and users with view_reconciliation permission to read product variant data for reconciliation purposes';