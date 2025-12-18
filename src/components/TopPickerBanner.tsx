import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toZonedTime } from 'date-fns-tz';
import { startOfWeek, endOfWeek } from 'date-fns';
export function TopPickerBanner() {
  const [topPicker, setTopPicker] = useState<{
    name: string;
    orders_completed_week: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function fetchTopPicker() {
      try {
        const timezone = 'America/Lima';

        // Obtener la fecha actual en zona horaria de Lima
        const nowInLima = toZonedTime(new Date(), timezone);

        // Calcular inicio de semana (Lunes 00:00:00) y fin de semana (Domingo 23:59:59)
        const weekStart = startOfWeek(nowInLima, {
          weekStartsOn: 1
        }); // 1 = Lunes
        const weekEnd = endOfWeek(nowInLima, {
          weekStartsOn: 1
        });

        // Ajustar las horas a la zona horaria local de Lima
        const startOfWeekLima = new Date(weekStart);
        startOfWeekLima.setHours(0, 0, 0, 0);
        const endOfWeekLima = new Date(weekEnd);
        endOfWeekLima.setHours(23, 59, 59, 999);
        const userOrderCount: {
          [key: string]: number;
        } = {};

        // Obtener sesiones de picking libre completadas esta semana con productos_retirados_por
        const {
          data: pickingLibreSessions,
          error: pickingLibreError
        } = await supabase.from('picking_libre_sessions').select('id, productos_retirados_por').eq('status', 'completado').gte('completed_at', startOfWeekLima.toISOString()).lte('completed_at', endOfWeekLima.toISOString()).not('productos_retirados_por', 'is', null).not('bsale_response', 'is', null); // Solo contar los que tienen documento emitido

        if (pickingLibreError) {
          console.error('Error fetching picking libre sessions for banner:', pickingLibreError);
        } else if (pickingLibreSessions && pickingLibreSessions.length > 0) {
          // Contar sesiones por productos_retirados_por
          for (const session of pickingLibreSessions) {
            const userName = session.productos_retirados_por;
            if (userName) {
              userOrderCount[userName] = (userOrderCount[userName] || 0) + 1;
            }
          }
        }

        // Encontrar el usuario con más pedidos
        const sortedUsers = Object.entries(userOrderCount).map(([name, count]) => ({
          name,
          orders_completed_week: count
        })).filter(user => user.orders_completed_week > 0).sort((a, b) => b.orders_completed_week - a.orders_completed_week);
        if (sortedUsers.length > 0) {
          setTopPicker(sortedUsers[0]);
        } else {
          setTopPicker(null);
        }
      } catch (error) {
        console.error('Error fetching top picker:', error);
        setTopPicker(null);
      } finally {
        setLoading(false);
      }
    }
    fetchTopPicker();
  }, []);
  if (loading || !topPicker) return null;
  return <div className="bg-gradient-to-r from-yellow-400/20 via-orange-400/20 to-yellow-400/20 border-b-2 border-yellow-500/50 shadow-md">
      <div className="max-w-[1600px] mx-auto px-4 py-3 bg-primary-foreground">
        <div className="flex items-center justify-center gap-2 text-center">
          <span className="text-base">👑</span>
          <p className="text-base font-bold text-foreground sm:text-sm">
            <span className="text-yellow-600 dark:text-yellow-400">{topPicker.name}</span>
            {' '}es el picker con más pedidos sacados de esta semana
          </p>
          <span className="text-base">💯</span>
        </div>
        
      </div>
    </div>;
}