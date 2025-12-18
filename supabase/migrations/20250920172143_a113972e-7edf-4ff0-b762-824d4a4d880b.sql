-- Fix profiles table security vulnerability by removing overly permissive RLS policy
-- The "Exclude deleted users from normal views" policy was allowing any authenticated user 
-- to read all profiles where deleted_at IS NULL, which exposes employee personal information

-- Drop ALL existing policies on profiles table first
DROP POLICY IF EXISTS "Exclude deleted users from normal views" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view deleted users" ON public.profiles;  
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;

-- Create new restrictive policies that prevent the security vulnerability
-- Users can only view their own non-deleted profile
CREATE POLICY "Users can view own profile only" 
ON public.profiles 
FOR SELECT 
TO authenticated
USING (auth.uid() = id AND deleted_at IS NULL);

-- Admins can view all profiles (including deleted ones)
CREATE POLICY "Admins can view all profiles including deleted" 
ON public.profiles 
FOR SELECT 
TO authenticated
USING (user_has_role('admin'::text));

-- Users can only update their own non-deleted profile
CREATE POLICY "Users can update own profile only" 
ON public.profiles 
FOR UPDATE 
TO authenticated
USING (auth.uid() = id AND deleted_at IS NULL)
WITH CHECK (auth.uid() = id AND deleted_at IS NULL);

-- Admins can update any profile
CREATE POLICY "Admins can update any profile" 
ON public.profiles 
FOR UPDATE 
TO authenticated
USING (user_has_role('admin'::text))
WITH CHECK (user_has_role('admin'::text));