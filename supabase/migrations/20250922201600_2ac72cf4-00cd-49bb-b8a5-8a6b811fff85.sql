-- Fix security warnings by updating functions with proper search_path
CREATE OR REPLACE FUNCTION public.is_target_user_admin(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = target_user_id AND role = 'admin'::user_role
    );
$$;

CREATE OR REPLACE FUNCTION public.supervisor_cannot_modify_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER  
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.user_types ut ON p.user_type_id = ut.id
        WHERE p.id = auth.uid() 
        AND ut.name = 'supervisor'
    );
$$;