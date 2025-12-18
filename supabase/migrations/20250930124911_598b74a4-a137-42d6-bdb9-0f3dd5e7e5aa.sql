-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Schedule daily stock snapshot at 11:59 PM every day
SELECT cron.schedule(
  'daily-stock-snapshot',
  '59 23 * * *', -- Every day at 11:59 PM
  $$
  SELECT
    net.http_post(
        url:='https://cflyvlkpbodtutyikfbk.supabase.co/functions/v1/daily-stock-snapshot',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmbHl2bGtwYm9kdHV0eWlrZmJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0OTY1NTMsImV4cCI6MjA3MjA3MjU1M30.C9rhSTvKPl4eYnNA6ONTmyjwrrtssoVpJdcPKgI_i10"}'::jsonb,
        body:=concat('{"trigger": "cron", "date": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);

-- Create a manual trigger function for admins
CREATE OR REPLACE FUNCTION public.trigger_stock_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Only admins can trigger this
  IF NOT user_has_role('admin'::text) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  -- Make HTTP request to edge function
  SELECT 
    net.http_post(
        url:='https://cflyvlkpbodtutyikfbk.supabase.co/functions/v1/daily-stock-snapshot',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmbHl2bGtwYm9kdHV0eWlrZmJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0OTY1NTMsImV4cCI6MjA3MjA3MjU1M30.C9rhSTvKPl4eYnNA6ONTmyjwrrtssoVpJdcPKgI_i10"}'::jsonb,
        body:='{"trigger": "manual"}'::jsonb
    ) INTO result;

  RETURN jsonb_build_object('success', true, 'message', 'Stock snapshot triggered');
END;
$$;