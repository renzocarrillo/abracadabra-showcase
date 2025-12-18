-- Fix GRANT statements for functions
-- The previous migration had GRANT statements without full function signatures

-- Revoke the incomplete grants (if they exist)
REVOKE ALL ON FUNCTION public.verify_and_log_committed_stock FROM authenticated;
REVOKE ALL ON FUNCTION public.get_assignment_history FROM authenticated;

-- Grant with proper function signatures
GRANT EXECUTE ON FUNCTION public.verify_and_log_committed_stock(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_assignment_history(TEXT) TO authenticated;
