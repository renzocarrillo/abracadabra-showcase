-- Add soft delete fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN deleted_by_user_id UUID DEFAULT NULL,
ADD COLUMN deleted_by_user_name TEXT DEFAULT NULL,
ADD COLUMN deletion_reason TEXT DEFAULT 'Eliminado por administrador';

-- Create index for better performance when filtering deleted users
CREATE INDEX idx_profiles_deleted_at ON public.profiles(deleted_at);

-- Update RLS policies to exclude deleted users from normal operations
CREATE POLICY "Exclude deleted users from normal views" 
ON public.profiles 
FOR SELECT 
USING (deleted_at IS NULL OR user_has_role('admin'::text));

-- Allow admins to view deleted users specifically
CREATE POLICY "Admins can view deleted users" 
ON public.profiles 
FOR SELECT 
USING (user_has_role('admin'::text));