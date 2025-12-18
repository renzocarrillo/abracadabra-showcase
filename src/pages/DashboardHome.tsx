import { Card } from '@/components/ui/card';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import OrderSignatureChart from '@/components/OrderSignatureChart';
import StockTrendChart from '@/components/StockTrendChart';
import StoreStockTreemap from '@/components/StoreStockTreemap';
import ProductTypeTreemap from '@/components/ProductTypeTreemap';
import { TopProductTypesChart } from '@/components/TopProductTypesChart';
import { TopProductsChart } from '@/components/TopProductsChart';
import { toZonedTime } from 'date-fns-tz';
import { startOfWeek, endOfWeek } from 'date-fns';

function StatsCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <Card className="p-6">
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-2">{title}</h3>
        <div className="text-4xl font-bold text-foreground mb-1">{value}</div>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
    </Card>
  );
}

function TopPickersTable() {
  const [topPickers, setTopPickers] = useState<{ name: string; orders_completed_week: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekRange, setWeekRange] = useState<string>('');
  
  useEffect(() => {
    async function fetchUserOrdersCompletedThisWeek() {
      try {
        const timezone = 'America/Lima';
        
        // Obtener la fecha actual en zona horaria de Lima
        const nowInLima = toZonedTime(new Date(), timezone);
        
        // Calcular inicio de semana (Lunes 00:00:00) y fin de semana (Domingo 23:59:59)
        const weekStart = startOfWeek(nowInLima, { weekStartsOn: 1 }); // 1 = Lunes
        const weekEnd = endOfWeek(nowInLima, { weekStartsOn: 1 });
        
        // Ajustar las horas a la zona horaria local de Lima
        const startOfWeekLima = new Date(weekStart);
        startOfWeekLima.setHours(0, 0, 0, 0);
        
        const endOfWeekLima = new Date(weekEnd);
        endOfWeekLima.setHours(23, 59, 59, 999);

        // Formatear el rango de fechas para mostrar
        const formatDate = (date: Date) => {
          return date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
        };
        setWeekRange(`${formatDate(startOfWeekLima)} - ${formatDate(endOfWeekLima)}`);

        console.log('=== RANGO SEMANA ACTUAL (Lima) ===');
        console.log('Inicio:', startOfWeekLima.toISOString());
        console.log('Fin:', endOfWeekLima.toISOString());

        const userOrderCount: { [key: string]: number } = {};

        // Obtener sesiones de picking libre completadas esta semana con productos_retirados_por
        const { data: pickingLibreSessions, error: pickingLibreError } = await supabase
          .from('picking_libre_sessions')
          .select('id, productos_retirados_por')
          .eq('status', 'completado')
          .gte('completed_at', startOfWeekLima.toISOString())
          .lte('completed_at', endOfWeekLima.toISOString())
          .not('productos_retirados_por', 'is', null)
          .not('bsale_response', 'is', null); // Solo contar los que tienen documento emitido

        if (pickingLibreError) {
          console.error('Error fetching picking libre sessions:', pickingLibreError);
        } else if (pickingLibreSessions && pickingLibreSessions.length > 0) {
          console.log('Sesiones de picking libre encontradas:', pickingLibreSessions.length);
          
          // Contar sesiones por productos_retirados_por
          for (const session of pickingLibreSessions) {
            const userName = session.productos_retirados_por;
            if (userName) {
              userOrderCount[userName] = (userOrderCount[userName] || 0) + 1;
            }
          }
        }

        // Obtener pedidos archivados esta semana con productos_retirados_por
        const { data: archivedOrders, error: ordersError } = await supabase
          .from('pedidos')
          .select('id, productos_retirados_por, updated_at')
          .eq('estado', 'archivado')
          .gte('updated_at', startOfWeekLima.toISOString())
          .lte('updated_at', endOfWeekLima.toISOString())
          .not('productos_retirados_por', 'is', null)
          .not('url_public_view', 'is', null); // Solo contar los que tienen documento emitido

        if (ordersError) {
          console.error('Error fetching archived orders:', ordersError);
        } else if (archivedOrders && archivedOrders.length > 0) {
          console.log('Pedidos archivados encontrados:', archivedOrders.length);
          
          // Contar pedidos por productos_retirados_por
          for (const order of archivedOrders) {
            const userName = order.productos_retirados_por;
            if (userName) {
              userOrderCount[userName] = (userOrderCount[userName] || 0) + 1;
            }
          }
        }

        // Convertir el mapa a array y ordenar por cantidad descendente
        const sortedUsers = Object.entries(userOrderCount)
          .map(([name, count]) => ({
            name,
            orders_completed_week: count
          }))
          .filter(user => user.orders_completed_week > 0)
          .sort((a, b) => b.orders_completed_week - a.orders_completed_week)
          .slice(0, 10); // Top 10 usuarios

        console.log('Usuarios con pedidos completados esta semana:', sortedUsers);
        setTopPickers(sortedUsers);
      } catch (error) {
        console.error('Error fetching user orders completed:', error);
        setTopPickers([]);
      } finally {
        setLoading(false);
      }
    }
    
    fetchUserOrdersCompletedThisWeek();
  }, []);

  if (loading) {
    return (
      <Card className="p-6 bg-card border-border">
        <h3 className="text-lg font-semibold text-foreground mb-4">Ranking de usuarios por pedidos completados esta semana</h3>
        <div className="text-center text-muted-foreground">Cargando ranking...</div>
      </Card>
    );
  }

  return (
    <Card className="p-4 md:p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground">Ranking de usuarios por pedidos completados esta semana</h3>
        <p className="text-sm text-muted-foreground mt-1">{weekRange}</p>
      </div>
      
      {/* Desktop Table View */}
      <div className="hidden sm:block overflow-hidden rounded-lg border border-border">
        <table className="w-full">
          <thead>
            <tr className="bg-table-header">
              <th className="px-6 py-3 text-left text-sm font-medium text-muted-foreground">Posición</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-muted-foreground">Usuario</th>
              <th className="px-6 py-3 text-right text-sm font-medium text-muted-foreground">Pedidos completados</th>
            </tr>
          </thead>
          <tbody>
            {topPickers.length > 0 ? topPickers.map((picker, index) => (
              <tr
                key={picker.name}
                className={`${index % 2 === 0 ? 'bg-table-row' : 'bg-table-header'} hover:bg-table-hover transition-colors`}
              >
                <td className="px-6 py-4 text-sm text-foreground">
                  <div className="flex items-center">
                    <span className={`inline-block w-6 h-6 rounded-full text-xs font-bold text-white flex items-center justify-center mr-3 ${
                      index === 0 ? 'bg-yellow-500' : 
                      index === 1 ? 'bg-gray-400' : 
                      index === 2 ? 'bg-orange-600' : 'bg-blue-500'
                    }`}>
                      {index + 1}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-foreground font-medium">
                  {picker.name || 'Usuario no identificado'}
                </td>
                <td className="px-6 py-4 text-sm text-foreground text-right font-bold">{picker.orders_completed_week}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-muted-foreground">
                  No hay usuarios con pedidos completados esta semana
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="sm:hidden space-y-3">
        {topPickers.length > 0 ? topPickers.map((picker, index) => (
          <Card key={picker.name} className="p-4 bg-table-row border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`inline-block w-8 h-8 rounded-full text-sm font-bold text-white flex items-center justify-center ${
                  index === 0 ? 'bg-yellow-500' : 
                  index === 1 ? 'bg-gray-400' : 
                  index === 2 ? 'bg-orange-600' : 'bg-blue-500'
                }`}>
                  {index + 1}
                </span>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">
                    {picker.name || 'Usuario no identificado'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {picker.orders_completed_week} pedido{picker.orders_completed_week !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              <span className="text-lg font-bold text-foreground">
                {picker.orders_completed_week}
              </span>
            </div>
          </Card>
        )) : (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No hay usuarios con pedidos completados esta semana
          </div>
        )}
      </div>
    </Card>
  );
}

export default function DashboardHome() {
  const [processedOrdersToday, setProcessedOrdersToday] = useState<number>(0);
  const [processedProductsToday, setProcessedProductsToday] = useState<number>(0);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    async function fetchProcessedData() {
      try {
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 5, 0, 0, 0);
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

        // Contar pedidos realmente archivados (completados correctamente)
        const { data: archivedOrders, error: ordersError } = await supabase
          .from('pedidos')
          .select(`
            id,
            created_at,
            pedidos_detalle!inner(cantidad_solicitada)
          `)
          .eq('estado', 'archivado')
          .gte('created_at', startOfDay.toISOString())
          .lt('created_at', endOfDay.toISOString());

        // Contar ventas realmente archivadas (completadas correctamente)
        const { data: archivedSales, error: salesError } = await supabase
          .from('ventas')
          .select(`
            id,
            created_at,
            ventas_detalle!inner(cantidad)
          `)
          .eq('estado', 'archivado')
          .gte('created_at', startOfDay.toISOString())
          .lt('created_at', endOfDay.toISOString());

        // Contar sesiones de picking libre completadas con documento emitido
        const { data: pickingLibreSessions, error: pickingLibreError } = await supabase
          .from('picking_libre_sessions')
          .select('id, total_items, bsale_response, url_public_view')
          .eq('status', 'completado')
          .gte('completed_at', startOfDay.toISOString())
          .lt('completed_at', endOfDay.toISOString())
          .not('bsale_response', 'is', null); // Solo contar los que tienen documento emitido

        console.log('=== DEBUG DASHBOARD STATS ===');
        console.log('Fecha consultada:', { startOfDay, endOfDay });
        console.log('Pedidos archivados encontrados:', archivedOrders?.length || 0);
        console.log('Ventas archivadas encontradas:', archivedSales?.length || 0);
        console.log('Picking libre con documento:', pickingLibreSessions?.length || 0);
        
        if (ordersError || salesError || pickingLibreError) {
          console.error('Error fetching archived data:', ordersError || salesError || pickingLibreError);
          setProcessedOrdersToday(0);
          setProcessedProductsToday(0);
          return;
        }

        let totalOrders = 0;
        let totalProducts = 0;

        // Contar pedidos archivados y sus productos
        if (archivedOrders && archivedOrders.length > 0) {
          totalOrders += archivedOrders.length;
          for (const order of archivedOrders) {
            totalProducts += order.pedidos_detalle.reduce((sum, detail) => sum + (detail.cantidad_solicitada || 0), 0);
          }
        }

        // Contar ventas archivadas y sus productos
        if (archivedSales && archivedSales.length > 0) {
          totalOrders += archivedSales.length;
          for (const sale of archivedSales) {
            totalProducts += sale.ventas_detalle.reduce((sum, detail) => sum + (detail.cantidad || 0), 0);
          }
        }

        // Contar sesiones de picking libre con documento
        if (pickingLibreSessions && pickingLibreSessions.length > 0) {
          totalOrders += pickingLibreSessions.length;
          for (const session of pickingLibreSessions) {
            totalProducts += session.total_items || 0;
          }
        }

        console.log('=== RESULTADOS FINALES ===');
        console.log('Total pedidos archivados hoy:', totalOrders);
        console.log('Total productos procesados hoy:', totalProducts);
        
        setProcessedOrdersToday(totalOrders);
        setProcessedProductsToday(totalProducts);
      } catch (error) {
        console.error('Error fetching archived data:', error);
        setProcessedOrdersToday(0);
        setProcessedProductsToday(0);
      } finally {
        setLoadingStats(false);
      }
    }

    fetchProcessedData();
  }, []);

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Resumen de operaciones del día</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatsCard
          title="Pedidos Procesados hoy"
          value={loadingStats ? "..." : processedOrdersToday.toString()}
        />
        <StatsCard
          title="Productos procesados hoy"
          value={loadingStats ? "..." : processedProductsToday.toString()}
        />
      </div>

      {/* Ranking de usuarios - Visible para todos */}
      <div className="mt-6">
        <TopPickersTable />
      </div>

      {/* Main Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <OrderSignatureChart />
        <StockTrendChart />
      </div>

      {/* Stock Distribution Treemaps */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StoreStockTreemap />
        <ProductTypeTreemap />
      </div>

      {/* Top 10 Charts (últimos 7 días) */}
      <div className="mt-8">
        <h2 className="text-2xl font-semibold text-foreground mb-4">
          Productos más despachados (últimos 7 días)
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TopProductTypesChart />
          <TopProductsChart />
        </div>
      </div>
    </div>
  );
}