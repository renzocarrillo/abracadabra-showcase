import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { supabase } from '@/integrations/supabase/client';

const COLORS = {
  signed: 'hsl(var(--primary))',
  unsigned: 'hsl(var(--muted))'
};

interface SignatureData {
  name: string;
  value: number;
  color: string;
}

export default function OrderSignatureChart() {
  const [data, setData] = useState<SignatureData[]>([]);
  const [loading, setLoading] = useState(true);
  const [percentage, setPercentage] = useState<number>(0);

  useEffect(() => {
    async function fetchSignatureStats() {
      try {
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 5, 0, 0, 0); // 5 AM UTC = medianoche Peru
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

        // Obtener pedidos procesados HOY desde audit logs
        const { data: processedOrderLogs, error: orderLogsError } = await supabase
          .from('pedidos_audit_log')
          .select('pedido_id')
          .in('accion', ['completado', 'documento_emitido'])
          .gte('created_at', startOfDay.toISOString())
          .lt('created_at', endOfDay.toISOString());

        // Obtener ventas procesadas HOY desde audit logs  
        const { data: processedSaleLogs, error: saleLogsError } = await supabase
          .from('ventas_audit_log')
          .select('venta_id')
          .in('accion', ['completado', 'documento_emitido'])
          .gte('created_at', startOfDay.toISOString())
          .lt('created_at', endOfDay.toISOString());

        // Obtener sesiones de picking libre completadas HOY con documento emitido
        const { data: pickingLibreSessions, error: pickingLibreError } = await supabase
          .from('picking_libre_sessions')
          .select('id')
          .eq('status', 'completado')
          .gte('completed_at', startOfDay.toISOString())
          .lt('completed_at', endOfDay.toISOString())
          .not('bsale_response', 'is', null); // Solo contar los que tienen documento emitido

        if (orderLogsError || saleLogsError || pickingLibreError) {
          console.error('Error fetching processed logs:', orderLogsError || saleLogsError || pickingLibreError);
          return;
        }

        // Obtener IDs únicos de pedidos, ventas y picking libre procesados hoy
        const uniqueOrderIds = [...new Set(processedOrderLogs?.map(log => log.pedido_id) || [])];
        const uniqueSaleIds = [...new Set(processedSaleLogs?.map(log => log.venta_id) || [])];
        const uniquePickingLibreIds = pickingLibreSessions?.map(session => session.id) || [];
        
        const totalProcessedToday = uniqueOrderIds.length + uniqueSaleIds.length + uniquePickingLibreIds.length;
        
        if (totalProcessedToday === 0) {
          setData([
            { name: 'Sin pedidos procesados hoy', value: 1, color: COLORS.unsigned }
          ]);
          setPercentage(0);
          return;
        }

        // Obtener firmas de los pedidos procesados hoy
        let signedCount = 0;

        if (uniqueOrderIds.length > 0) {
          const { data: orderSignatures } = await supabase
            .from('order_signatures')
            .select('order_id')
            .in('order_id', uniqueOrderIds)
            .eq('order_type', 'pedido');
          
          signedCount += orderSignatures?.length || 0;
        }

        if (uniqueSaleIds.length > 0) {
          const { data: saleSignatures } = await supabase
            .from('order_signatures')
            .select('order_id')
            .in('order_id', uniqueSaleIds)
            .eq('order_type', 'venta');
          
          signedCount += saleSignatures?.length || 0;
        }

        if (uniquePickingLibreIds.length > 0) {
          const { data: pickingLibreSignatures } = await supabase
            .from('order_signatures')
            .select('order_id')
            .in('order_id', uniquePickingLibreIds)
            .eq('order_type', 'picking_libre');
          
          signedCount += pickingLibreSignatures?.length || 0;
        }

        const unsignedCount = totalProcessedToday - signedCount;
        const signedPercentage = Math.round((signedCount / totalProcessedToday) * 100);

        setPercentage(signedPercentage);
        setData([
          { name: 'Firmados hoy', value: signedCount, color: COLORS.signed },
          { name: 'Sin firmar hoy', value: unsignedCount, color: COLORS.unsigned }
        ]);

      } catch (error) {
        console.error('Error fetching signature stats:', error);
        setData([]);
        setPercentage(0);
      } finally {
        setLoading(false);
      }
    }

    fetchSignatureStats();
  }, []);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="text-foreground font-medium">{data.name}</p>
          <p className="text-muted-foreground">
            {data.value} pedidos ({Math.round((data.value / (data.payload.value + (payload[1]?.value || 0))) * 100)}%)
          </p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <Card className="p-6 bg-card border-border">
        <h3 className="text-lg font-semibold text-foreground mb-4">Estado de Firmas</h3>
        <div className="text-center text-muted-foreground">Cargando...</div>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-card border-border">
      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold text-foreground">Estado de Firmas</h3>
        <p className="text-sm text-muted-foreground">De pedidos procesados</p>
        <div className="mt-2">
          <span className="text-2xl font-bold text-foreground">{percentage}%</span>
          <p className="text-xs text-muted-foreground">firmados</p>
        </div>
      </div>
      
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              wrapperStyle={{ 
                fontSize: '12px',
                color: 'hsl(var(--foreground))'
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}