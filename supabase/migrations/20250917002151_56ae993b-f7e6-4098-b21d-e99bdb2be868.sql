-- Agregar campo facturacion_info a la tabla ventas para almacenar información de facturación separada para empresas
ALTER TABLE public.ventas 
ADD COLUMN facturacion_info JSONB;