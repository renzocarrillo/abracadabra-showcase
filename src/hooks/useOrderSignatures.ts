import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface OrderSignature {
  id: string;
  order_id: string;
  order_type: 'pedido' | 'venta' | 'picking_libre';
  order_code: string;
  signed_by: string;
  signed_by_name: string;
  signed_at: string;
  review_notes?: string;
  signature_hash: string;
}

export const useOrderSignatures = () => {
  const [signatures, setSignatures] = useState<OrderSignature[]>([]);
  const [loading, setLoading] = useState(true);
  const [canSign, setCanSign] = useState(false);
  const { user, profile } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user && profile) {
      checkSigningPermissions();
      fetchSignatures();
    }
  }, [user, profile]);

  const checkSigningPermissions = async () => {
    try {
      const { data, error } = await supabase.rpc('can_sign_orders');
      if (!error) {
        setCanSign(data || false);
      }
    } catch (error) {
      console.error('Error checking signing permissions:', error);
      setCanSign(false);
    }
  };

  const fetchSignatures = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('order_signatures')
        .select('*')
        .order('signed_at', { ascending: false });

      if (error) throw error;
      setSignatures((data || []) as OrderSignature[]);
    } catch (error) {
      console.error('Error fetching signatures:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSignatureForOrder = (orderId: string, orderType: 'pedido' | 'venta' | 'picking_libre') => {
    return signatures.find(sig => sig.order_id === orderId && sig.order_type === orderType);
  };

  const signOrder = async (
    orderId: string,
    orderType: 'pedido' | 'venta' | 'picking_libre',
    orderCode: string,
    reviewNotes?: string
  ) => {
    if (!user || !profile || !canSign) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No tienes permisos para firmar pedidos"
      });
      return false;
    }

    try {
      const signedAt = new Date();
      
      // Generate signature hash
      const { data: hashData, error: hashError } = await supabase.rpc(
        'generate_signature_hash',
        {
          p_order_id: orderId,
          p_order_type: orderType,
          p_signed_by: user.id,
          p_signed_at: signedAt.toISOString()
        }
      );

      if (hashError) throw hashError;

      const { error } = await supabase
        .from('order_signatures')
        .insert({
          order_id: orderId,
          order_type: orderType,
          order_code: orderCode,
          signed_by: user.id,
          signed_by_name: profile.full_name || profile.email,
          signed_at: signedAt.toISOString(),
          review_notes: reviewNotes,
          signature_hash: hashData
        });

      if (error) throw error;

      const typeLabel = orderType === 'pedido' ? 'Pedido' : orderType === 'venta' ? 'Venta' : 'Picking Libre';
      toast({
        title: "Éxito",
        description: `${typeLabel} ${orderCode} firmado correctamente`
      });

      await fetchSignatures();
      return true;
    } catch (error: any) {
      console.error('Error signing order:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Error al firmar el pedido"
      });
      return false;
    }
  };

  return {
    signatures,
    loading,
    canSign,
    getSignatureForOrder,
    signOrder,
    refetch: fetchSignatures
  };
};