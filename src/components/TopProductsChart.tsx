import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

interface ProductData {
  name: string;
  quantity: number;
  color: string;
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(210, 60%, 60%)',
  'hsl(280, 60%, 60%)',
  'hsl(340, 60%, 60%)',
  'hsl(40, 70%, 55%)',
];

export function TopProductsChart() {
  const { data, isLoading } = useQuery({
    queryKey: ['topProducts7Days'],
    queryFn: async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Obtener datos de picking libre
      const { data: pickingData, error: pickingError } = await supabase
        .from('picking_libre_items')
        .select(`
          sku,
          nombre_producto,
          quantity,
          scanned_at
        `)
        .gte('scanned_at', sevenDaysAgo.toISOString());

      if (pickingError) throw pickingError;

      // Obtener datos de ventas archivadas (completadas)
      const { data: ventasData, error: ventasError } = await supabase
        .from('ventas_detalle')
        .select(`
          sku,
          cantidad,
          ventas!inner(estado, updated_at)
        `)
        .eq('ventas.estado', 'archivado')
        .gte('ventas.updated_at', sevenDaysAgo.toISOString());

      if (ventasError) throw ventasError;

      // Obtener datos de pedidos completados
      const { data: pedidosData, error: pedidosError } = await supabase
        .from('pedidos_detalle')
        .select(`
          sku,
          nombre_producto,
          cantidad_asignada,
          pedidos!inner(estado, updated_at)
        `)
        .eq('pedidos.estado', 'archivado')
        .gte('pedidos.updated_at', sevenDaysAgo.toISOString());

      if (pedidosError) throw pedidosError;

      // Consolidar cantidades por SKU con nombre si está disponible
      const skuQuantities: Record<string, number> = {};
      const skuToName: Record<string, string> = {};

      pickingData?.forEach(item => {
        skuQuantities[item.sku] = (skuQuantities[item.sku] || 0) + item.quantity;
        if (item.nombre_producto) skuToName[item.sku] = item.nombre_producto;
      });

      ventasData?.forEach(item => {
        skuQuantities[item.sku] = (skuQuantities[item.sku] || 0) + item.cantidad;
      });

      pedidosData?.forEach(item => {
        skuQuantities[item.sku] = (skuQuantities[item.sku] || 0) + item.cantidad_asignada;
        if (item.nombre_producto) skuToName[item.sku] = item.nombre_producto;
      });

      // Convertir a array, poner nombre por sku y ordenar
      const chartData: ProductData[] = Object.entries(skuQuantities)
        .map(([sku, quantity], index) => ({
          name: (skuToName[sku] || sku).length > 30 ? (skuToName[sku] || sku).substring(0, 30) + '...' : (skuToName[sku] || sku),
          quantity,
          color: COLORS[index % COLORS.length],
        }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10);

      return chartData;
    },
    refetchInterval: 60000, // Refrescar cada minuto
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top 10 Productos (7 días)</CardTitle>
          <CardDescription>Productos más despachados del almacén</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[350px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top 10 Productos (7 días)</CardTitle>
        <CardDescription>Productos más despachados del almacén</CardDescription>
      </CardHeader>
      <CardContent>
        {(!data || data.length === 0) ? (
          <div className="h-[350px] w-full flex items-center justify-center text-sm text-muted-foreground">
            No hay movimientos en los últimos 7 días.
          </div>
        ) : (
        <ResponsiveContainer width="100%" height={350}>
          <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 5, right: 60, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis type="number" className="text-xs" />
              <YAxis 
                dataKey="name" 
                type="category" 
                width={180}
                className="text-xs"
                tick={{ fill: 'hsl(var(--foreground))' }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Bar dataKey="quantity" radius={[0, 4, 4, 0]}>
                {data?.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
