import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

interface ProductTypeData {
  type: string;
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

function getTypeFromName(name: string): string {
  if (!name) return 'Sin categoría';
  const parts = name.trim().split(/\s+/);
  // Usa la primera palabra como "tipo" de respaldo (marca/familia)
  return parts[0] || 'Sin categoría';
}

export function TopProductTypesChart() {
  const { data, isLoading, error: queryError } = useQuery({
    queryKey: ['topProductTypes7Days'],
    queryFn: async () => {
      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        console.log('🔍 Consultando datos desde:', sevenDaysAgo.toISOString());

        // Obtener datos de picking libre
        const { data: pickingData, error: pickingError } = await supabase
          .from('picking_libre_items')
          .select(`
            sku,
            nombre_producto,
            quantity,
            scanned_at,
            session_id
          `)
          .gte('scanned_at', sevenDaysAgo.toISOString());

        console.log('📦 Picking libre items:', pickingData?.length || 0, pickingError);

        if (pickingError) {
          console.error('❌ Error picking libre:', pickingError);
          throw pickingError;
        }

        // Obtener datos de ventas archivadas (completadas)
        const { data: ventasData, error: ventasError } = await supabase
          .from('ventas_detalle')
          .select(`
            sku,
            nombre_producto,
            cantidad,
            ventas!inner(estado, updated_at)
          `)
          .eq('ventas.estado', 'archivado')
          .gte('ventas.updated_at', sevenDaysAgo.toISOString());

        console.log('💰 Ventas detalle:', ventasData?.length || 0, ventasError);

        if (ventasError) {
          console.error('❌ Error ventas:', ventasError);
          throw ventasError;
        }

        // Obtener datos de pedidos archivados (completados)
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

        console.log('📋 Pedidos detalle:', pedidosData?.length || 0, pedidosError);

        if (pedidosError) {
          console.error('❌ Error pedidos:', pedidosError);
          throw pedidosError;
        }

        // Obtener datos de traslados internos (productos despachados por traslado)
        const { data: transferData, error: transferError } = await supabase
          .from('traslados_internos_detalle')
          .select(`
            sku,
            quantity,
            traslados_internos!inner(created_at)
          `)
          .gte('traslados_internos.created_at', sevenDaysAgo.toISOString());

        console.log('🚚 Traslados internos detalle:', transferData?.length || 0, transferError);

        if (transferError) {
          console.error('❌ Error traslados:', transferError);
          throw transferError;
        }

        // Consolidar cantidades por SKU y mapear nombres cuando estén disponibles
        const skuQuantities: Record<string, number> = {};
        const skuToName: Record<string, string> = {};
        
        pickingData?.forEach(item => {
          skuQuantities[item.sku] = (skuQuantities[item.sku] || 0) + item.quantity;
          if (item.nombre_producto) skuToName[item.sku] = item.nombre_producto;
        });
        
        ventasData?.forEach(item => {
          skuQuantities[item.sku] = (skuQuantities[item.sku] || 0) + item.cantidad;
          if ((item as any).nombre_producto) skuToName[item.sku] = (item as any).nombre_producto;
        });
        
        pedidosData?.forEach(item => {
          skuQuantities[item.sku] = (skuQuantities[item.sku] || 0) + item.cantidad_asignada;
          if ((item as any)?.nombre_producto) skuToName[item.sku] = (item as any).nombre_producto;
        });
        
        // Agregar cantidades desde traslados internos
        transferData?.forEach(item => {
          skuQuantities[item.sku] = (skuQuantities[item.sku] || 0) + item.quantity;
        });

        console.log('📊 SKUs consolidados:', Object.keys(skuQuantities).length);

        // Obtener tipos usando nombre de producto
        const uniqueNames = Array.from(new Set(Object.values(skuToName))).filter(Boolean);
        console.log('🏷️ Nombres únicos para buscar tipos:', uniqueNames.length);

        const nameToType: Record<string, string> = {};
        if (uniqueNames.length > 0) {
          const { data: productsData, error: productsError } = await supabase
            .from('productosBsale')
            .select('nombreProducto, nameProductType')
            .in('nombreProducto', uniqueNames);

          console.log('🏷️ Productos encontrados por nombre:', productsData?.length || 0, productsError);
          if (productsError) console.warn('⚠️ Lookup por nombre falló (continuamos con SKU):', productsError);

          productsData?.forEach(p => {
            nameToType[p.nombreProducto] = p.nameProductType || 'Sin categoría';
          });
        }

        // Intentar mapear tipos directamente por SKU usando la tabla variants (más confiable)
        const uniqueSkus = Object.keys(skuQuantities);
        const skuToType: Record<string, string> = {};
        if (uniqueSkus.length > 0) {
          const { data: variantsData, error: variantsError } = await supabase
            .from('variants')
            .select('sku, nameProductType')
            .in('sku', uniqueSkus);
          console.log('🔗 Variants encontrados por SKU:', variantsData?.length || 0, variantsError);
          if (variantsError) console.warn('⚠️ Lookup por SKU falló:', variantsError);
          variantsData?.forEach(v => {
            if (v.sku && v.nameProductType) skuToType[v.sku] = v.nameProductType;
          });
        }

        // Agrupar por tipo de producto priorizando el mapeo por SKU
        const typeQuantities: Record<string, number> = {};
        Object.entries(skuQuantities).forEach(([sku, qty]) => {
          const name = skuToName[sku];
          const resolvedType = (skuToType as any)?.[sku] || (name ? (nameToType[name] || getTypeFromName(name)) : undefined) || 'Sin categoría';
          typeQuantities[resolvedType] = (typeQuantities[resolvedType] || 0) + qty;
        });

        console.log('📈 Tipos de productos agrupados:', Object.keys(typeQuantities).length);
        console.log('📈 Datos finales:', typeQuantities);

        // Convertir a array y ordenar
        const chartData: ProductTypeData[] = Object.entries(typeQuantities)
          .map(([type, quantity], index) => ({
            type,
            quantity,
            color: COLORS[index % COLORS.length],
          }))
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 10);

        console.log('✅ Chart data final:', chartData);

        return chartData;
      } catch (error) {
        console.error('💥 Error general en query:', error);
        throw error;
      }
    },
    refetchInterval: 60000, // Refrescar cada minuto
  });

  console.log('📊 Estado del componente:', { isLoading, hasData: !!data, dataLength: data?.length, queryError });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top 10 Tipos de Productos (7 días)</CardTitle>
          <CardDescription>Tipos más despachados del almacén</CardDescription>
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
        <CardTitle>Top 10 Tipos de Productos (7 días)</CardTitle>
        <CardDescription>Tipos más despachados del almacén</CardDescription>
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
                dataKey="type" 
                type="category" 
                width={150}
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
