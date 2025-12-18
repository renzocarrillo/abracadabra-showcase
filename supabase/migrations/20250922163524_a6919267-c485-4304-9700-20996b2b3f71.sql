-- Create order signatures system for manual review signing

-- Create table to store order signatures
CREATE TABLE public.order_signatures (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL,
    order_type TEXT NOT NULL CHECK (order_type IN ('pedido', 'venta')),
    order_code TEXT NOT NULL,
    signed_by UUID NOT NULL,
    signed_by_name TEXT NOT NULL,
    signed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    review_notes TEXT,
    signature_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique constraint to prevent duplicate signatures
CREATE UNIQUE INDEX idx_order_signatures_unique ON public.order_signatures(order_id, order_type);

-- Create index for performance
CREATE INDEX idx_order_signatures_signed_by ON public.order_signatures(signed_by);
CREATE INDEX idx_order_signatures_order_type ON public.order_signatures(order_type);

-- Enable RLS
ALTER TABLE public.order_signatures ENABLE ROW LEVEL SECURITY;

-- RLS policies for order signatures
CREATE POLICY "Authorized users can read signatures" 
ON public.order_signatures 
FOR SELECT 
TO authenticated
USING (
    user_has_role('admin'::text) OR 
    user_has_role('vendedora'::text) OR
    user_has_permission('view_orders'::text) OR
    user_has_permission('view_sales'::text)
);

CREATE POLICY "Supervisors and admins can create signatures" 
ON public.order_signatures 
FOR INSERT 
TO authenticated
WITH CHECK (
    (user_has_role('admin'::text) OR 
     user_has_permission('sign_orders'::text) OR
     EXISTS (
         SELECT 1 FROM profiles p
         JOIN user_types ut ON p.user_type_id = ut.id
         WHERE p.id = auth.uid() AND ut.name IN ('supervisor', 'admin')
     )) AND
    signed_by = auth.uid()
);

-- Function to check if user can sign orders
CREATE OR REPLACE FUNCTION public.can_sign_orders()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.role = 'admin'::user_role
    ) OR EXISTS (
        SELECT 1 FROM profiles p
        JOIN user_types ut ON p.user_type_id = ut.id
        WHERE p.id = auth.uid() AND ut.name IN ('supervisor', 'admin')
    ) OR user_has_permission('sign_orders'::text);
$$;

-- Function to generate signature hash
CREATE OR REPLACE FUNCTION public.generate_signature_hash(
    p_order_id uuid,
    p_order_type text,
    p_signed_by uuid,
    p_signed_at timestamp with time zone
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    RETURN encode(
        digest(
            concat(p_order_id::text, p_order_type, p_signed_by::text, extract(epoch from p_signed_at)::text),
            'sha256'
        ),
        'hex'
    );
END;
$$;