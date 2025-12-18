-- Ensure admin user type has all signature permissions
-- Get admin user type id
DO $$
DECLARE
  v_admin_id uuid;
  v_sign_orders_id uuid;
  v_sign_sales_id uuid;
  v_view_orders_sigs_id uuid;
  v_view_sales_sigs_id uuid;
BEGIN
  -- Get admin user type ID
  SELECT id INTO v_admin_id FROM user_types WHERE name = 'admin';
  
  -- Get permission IDs
  SELECT id INTO v_sign_orders_id FROM permissions WHERE name = 'sign_orders';
  SELECT id INTO v_sign_sales_id FROM permissions WHERE name = 'sign_sales';
  SELECT id INTO v_view_orders_sigs_id FROM permissions WHERE name = 'view_orders_signatures';
  SELECT id INTO v_view_sales_sigs_id FROM permissions WHERE name = 'view_sales_signatures';
  
  -- Insert permissions if they don't exist (using ON CONFLICT to avoid duplicates)
  INSERT INTO user_type_permissions (user_type_id, permission_id)
  VALUES 
    (v_admin_id, v_sign_orders_id),
    (v_admin_id, v_sign_sales_id),
    (v_admin_id, v_view_orders_sigs_id),
    (v_admin_id, v_view_sales_sigs_id)
  ON CONFLICT (user_type_id, permission_id) DO NOTHING;
  
  RAISE NOTICE 'Signature permissions assigned to admin user type';
END $$;