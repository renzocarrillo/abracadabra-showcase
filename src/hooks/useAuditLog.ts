import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export const useAuditLog = () => {
  const { user, profile } = useAuth();

  const logPedidoStateChange = async (
    pedidoId: string,
    pedidoCodigo: string,
    accion: 'completado' | 'cancelado' | 'modificado',
    estadoAnterior?: string,
    estadoNuevo?: string,
    detalles?: any
  ) => {
    try {
      const { error } = await supabase.rpc('log_pedido_state_change', {
        p_pedido_id: pedidoId,
        p_pedido_codigo: pedidoCodigo,
        p_accion: accion,
        p_estado_anterior: estadoAnterior || null,
        p_estado_nuevo: estadoNuevo || null,
        p_usuario_id: user?.id || null,
        p_usuario_nombre: profile?.full_name || user?.email || 'Usuario desconocido',
        p_detalles: detalles ? JSON.stringify(detalles) : null
      });

      if (error) {
        console.error('Error logging audit trail:', error);
      }
    } catch (error) {
      console.error('Error in audit logging:', error);
    }
  };

  const logVentaStateChange = async (
    ventaId: string,
    ventaCodigo: string,
    accion: 'completado' | 'cancelado' | 'modificado' | 'documento_emitido' | 'guia_emitida',
    estadoAnterior?: string,
    estadoNuevo?: string,
    detalles?: any
  ) => {
    try {
      const { error } = await supabase.rpc('log_venta_state_change', {
        p_venta_id: ventaId,
        p_venta_codigo: ventaCodigo,
        p_accion: accion,
        p_estado_anterior: estadoAnterior || null,
        p_estado_nuevo: estadoNuevo || null,
        p_usuario_id: user?.id || null,
        p_usuario_nombre: profile?.full_name || user?.email || 'Usuario desconocido',
        p_detalles: detalles ? JSON.stringify(detalles) : null
      });

      if (error) {
        console.error('Error logging venta audit trail:', error);
      }
    } catch (error) {
      console.error('Error in venta audit logging:', error);
    }
  };

  return {
    logPedidoStateChange,
    logVentaStateChange
  };
};