-- Crear enum para roles de usuario
CREATE TYPE public.user_role AS ENUM ('admin', 'vendedora');

-- Crear tabla de perfiles de usuario
CREATE TABLE public.profiles (
  id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  role user_role NOT NULL DEFAULT 'vendedora',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Habilitar RLS en la tabla profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Crear políticas RLS para profiles
CREATE POLICY "Los usuarios pueden ver su propio perfil"
ON public.profiles 
FOR SELECT 
USING (auth.uid() = id);

CREATE POLICY "Los usuarios pueden actualizar su propio perfil"
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = id);

CREATE POLICY "Los administradores pueden ver todos los perfiles"
ON public.profiles 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Función para manejar nuevos usuarios
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id, 
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'vendedora'
  );
  RETURN NEW;
END;
$$;

-- Trigger para crear perfil automáticamente al registrar usuario
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Función para verificar roles (evita recursión RLS)
CREATE OR REPLACE FUNCTION public.has_role(user_id uuid, check_role user_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = user_id AND role = check_role
  )
$$;

-- Actualizar políticas RLS de todas las tablas existentes para requerir autenticación
DROP POLICY IF EXISTS "Allow read access to bins" ON public.bins;
DROP POLICY IF EXISTS "Allow insert bins" ON public.bins;
DROP POLICY IF EXISTS "Allow update bins" ON public.bins;

CREATE POLICY "Usuarios autenticados pueden leer bins"
ON public.bins FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuarios autenticados pueden insertar bins"
ON public.bins FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar bins"
ON public.bins FOR UPDATE
TO authenticated
USING (true);

-- Actualizar políticas para pedidos
DROP POLICY IF EXISTS "Allow read access to pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Allow insert pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Allow update pedidos" ON public.pedidos;

CREATE POLICY "Usuarios autenticados pueden leer pedidos"
ON public.pedidos FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuarios autenticados pueden insertar pedidos"
ON public.pedidos FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar pedidos"
ON public.pedidos FOR UPDATE
TO authenticated
USING (true);

-- Actualizar políticas para pedidos_detalle
DROP POLICY IF EXISTS "Allow read access to pedidos_detalle" ON public.pedidos_detalle;
DROP POLICY IF EXISTS "Allow insert pedidos_detalle" ON public.pedidos_detalle;
DROP POLICY IF EXISTS "Allow update pedidos_detalle" ON public.pedidos_detalle;

CREATE POLICY "Usuarios autenticados pueden leer pedidos_detalle"
ON public.pedidos_detalle FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuarios autenticados pueden insertar pedidos_detalle"
ON public.pedidos_detalle FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar pedidos_detalle"
ON public.pedidos_detalle FOR UPDATE
TO authenticated
USING (true);

-- Actualizar políticas para stockxbin
DROP POLICY IF EXISTS "Allow read access to stockxbin" ON public.stockxbin;
DROP POLICY IF EXISTS "Allow insert stockxbin" ON public.stockxbin;
DROP POLICY IF EXISTS "Allow update stockxbin" ON public.stockxbin;

CREATE POLICY "Usuarios autenticados pueden leer stockxbin"
ON public.stockxbin FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuarios autenticados pueden insertar stockxbin"
ON public.stockxbin FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar stockxbin"
ON public.stockxbin FOR UPDATE
TO authenticated
USING (true);

-- Actualizar políticas para variants
DROP POLICY IF EXISTS "Allow read access to variants" ON public.variants;
DROP POLICY IF EXISTS "Allow insert variants" ON public.variants;
DROP POLICY IF EXISTS "Allow update variants" ON public.variants;

CREATE POLICY "Usuarios autenticados pueden leer variants"
ON public.variants FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuarios autenticados pueden insertar variants"
ON public.variants FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar variants"
ON public.variants FOR UPDATE
TO authenticated
USING (true);

-- Continúo con el resto de tablas...
DROP POLICY IF EXISTS "Allow read access to tiendas" ON public.tiendas;
DROP POLICY IF EXISTS "Allow insert tiendas" ON public.tiendas;
DROP POLICY IF EXISTS "Allow update tiendas" ON public.tiendas;

CREATE POLICY "Usuarios autenticados pueden leer tiendas"
ON public.tiendas FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuarios autenticados pueden insertar tiendas"
ON public.tiendas FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar tiendas"
ON public.tiendas FOR UPDATE
TO authenticated
USING (true);