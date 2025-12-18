-- Phase 1: Critical Security Fixes

-- First, create a security definer function to check user roles safely
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Function to check if user has specific role
CREATE OR REPLACE FUNCTION public.user_has_role(check_role text)
RETURNS boolean AS $$
  SELECT CASE 
    WHEN auth.uid() IS NULL THEN false
    ELSE EXISTS(
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role::text = check_role
    )
  END;
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Fix profiles table RLS policies (remove duplicates and add proper admin access)
DROP POLICY IF EXISTS "Los usuarios pueden actualizar su propio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Los usuarios pueden ver su propio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Usuarios pueden ver su propio perfil" ON public.profiles;

-- Create clear, non-conflicting policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (public.user_has_role('admin'));

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can update any profile" ON public.profiles
  FOR UPDATE USING (public.user_has_role('admin'));

-- Secure business data tables with role-based access

-- Pedidos (Orders) - Admin and vendedora can access
DROP POLICY IF EXISTS "Usuarios autenticados pueden leer pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Usuarios autenticados pueden insertar pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar pedidos" ON public.pedidos;

CREATE POLICY "Authorized users can read orders" ON public.pedidos
  FOR SELECT USING (
    public.user_has_role('admin') OR 
    public.user_has_role('vendedora')
  );

CREATE POLICY "Authorized users can create orders" ON public.pedidos
  FOR INSERT WITH CHECK (
    public.user_has_role('admin') OR 
    public.user_has_role('vendedora')
  );

CREATE POLICY "Authorized users can update orders" ON public.pedidos
  FOR UPDATE USING (
    public.user_has_role('admin') OR 
    public.user_has_role('vendedora')
  );

-- Stock data - Admin only
DROP POLICY IF EXISTS "Usuarios autenticados pueden leer stockxbin" ON public.stockxbin;
DROP POLICY IF EXISTS "Usuarios autenticados pueden insertar stockxbin" ON public.stockxbin;
DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar stockxbin" ON public.stockxbin;

CREATE POLICY "Admin can manage stock" ON public.stockxbin
  FOR ALL USING (public.user_has_role('admin'));

-- Stock totals - Admin only
DROP POLICY IF EXISTS "Usuarios autenticados pueden leer stock_totals" ON public.stock_totals;
DROP POLICY IF EXISTS "Usuarios autenticados pueden insertar stock_totals" ON public.stock_totals;
DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar stock_totals" ON public.stock_totals;

CREATE POLICY "Admin can view stock totals" ON public.stock_totals
  FOR ALL USING (public.user_has_role('admin'));

-- Ventas (Sales) - Admin and vendedora can access
DROP POLICY IF EXISTS "Usuarios autenticados pueden leer ventas" ON public.ventas;
DROP POLICY IF EXISTS "Usuarios autenticados pueden insertar ventas" ON public.ventas;
DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar ventas" ON public.ventas;

CREATE POLICY "Authorized users can read sales" ON public.ventas
  FOR SELECT USING (
    public.user_has_role('admin') OR 
    public.user_has_role('vendedora')
  );

CREATE POLICY "Authorized users can create sales" ON public.ventas
  FOR INSERT WITH CHECK (
    public.user_has_role('admin') OR 
    public.user_has_role('vendedora')
  );

CREATE POLICY "Authorized users can update sales" ON public.ventas
  FOR UPDATE USING (
    public.user_has_role('admin') OR 
    public.user_has_role('vendedora')
  );

-- Variants and Products - Read access for authenticated users, write for admin only
DROP POLICY IF EXISTS "Usuarios autenticados pueden leer variants" ON public.variants;
DROP POLICY IF EXISTS "Usuarios autenticados pueden insertar variants" ON public.variants;
DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar variants" ON public.variants;

CREATE POLICY "Authenticated users can read variants" ON public.variants
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admin can manage variants" ON public.variants
  FOR ALL USING (public.user_has_role('admin'));

-- Bins - Admin only
DROP POLICY IF EXISTS "Usuarios autenticados pueden leer bins" ON public.bins;
DROP POLICY IF EXISTS "Usuarios autenticados pueden insertar bins" ON public.bins;
DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar bins" ON public.bins;

CREATE POLICY "Admin can manage bins" ON public.bins
  FOR ALL USING (public.user_has_role('admin'));

-- Add security logging table for audit trail
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  table_name text,
  record_id text,
  details jsonb,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view audit logs" ON public.security_audit_log
  FOR SELECT USING (public.user_has_role('admin'));