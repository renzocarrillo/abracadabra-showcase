-- Create the daily schedule for Shopify product sync at 1:00 AM Lima time (UTC-5 = 6:00 AM UTC)
SELECT cron.schedule(
  'daily-shopify-product-sync',
  '0 6 * * *', -- 6:00 AM UTC = 1:00 AM Lima
  $$
  SELECT
    net.http_post(
        url:='https://cflyvlkpbodtutyikfbk.supabase.co/functions/v1/sync-all-products-to-shopify',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmbHl2bGtwYm9kdHV0eWlrZmJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0OTY1NTMsImV4cCI6MjA3MjA3MjU1M30.C9rhSTvKPl4eYnNA6ONTmyjwrrtssoVpJdcPKgI_i10"}'::jsonb,
        body:='{"trigger": "cron"}'::jsonb
    ) as request_id;
  $$
);

-- Create RPC function to manually trigger Shopify sync (admin only)
CREATE OR REPLACE FUNCTION public.trigger_shopify_sync()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
  v_active_sessions integer;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Not authenticated');
  END IF;

  -- Check if user is admin
  SELECT (role = 'admin') INTO v_is_admin
  FROM profiles
  WHERE id = v_user_id;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Admin access required');
  END IF;

  -- Check if there's already an active sync session
  SELECT COUNT(*) INTO v_active_sessions
  FROM shopify_sync_sessions
  WHERE status = 'in_progress'
  AND created_at > NOW() - INTERVAL '1 hour';

  IF v_active_sessions > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'A sync session is already in progress');
  END IF;

  -- Trigger the sync via edge function
  PERFORM net.http_post(
    url:='https://cflyvlkpbodtutyikfbk.supabase.co/functions/v1/sync-all-products-to-shopify',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmbHl2bGtwYm9kdHV0eWlrZmJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0OTY1NTMsImV4cCI6MjA3MjA3MjU1M30.C9rhSTvKPl4eYnNA6ONTmyjwrrtssoVpJdcPKgI_i10"}'::jsonb,
    body:=jsonb_build_object('trigger', 'manual', 'started_by', v_user_id::text)
  );

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Shopify sync triggered successfully',
    'started_by', v_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.trigger_shopify_sync() TO authenticated;

COMMENT ON FUNCTION public.trigger_shopify_sync() IS 'Manually trigger a full Shopify product sync. Admin only.';