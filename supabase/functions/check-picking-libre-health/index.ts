import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HealthAlert {
  severity: 'critical' | 'warning' | 'info';
  category: string;
  message: string;
  count: number;
  details?: any;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const alerts: HealthAlert[] = [];

    console.log('🏥 Starting Picking Libre health check...');

    // ============================================
    // 1. SESIONES EN 'emitiendo' >5 minutos
    // ============================================
    const { data: stuckSessions, error: stuckError } = await supabase
      .from('picking_libre_sessions')
      .select('id, created_by_name, documento_tipo, last_activity_at')
      .eq('status', 'emitiendo')
      .lt('last_activity_at', new Date(Date.now() - 5 * 60 * 1000).toISOString());

    if (stuckError) {
      console.error('Error checking stuck sessions:', stuckError);
    } else if (stuckSessions && stuckSessions.length > 0) {
      alerts.push({
        severity: 'critical',
        category: 'stuck_sessions',
        message: `${stuckSessions.length} sesiones en estado 'emitiendo' hace >5 minutos`,
        count: stuckSessions.length,
        details: stuckSessions
      });
    }

    // ============================================
    // 2. TASA DE ERROR >5% (última hora)
    // ============================================
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: recentEmissions } = await supabase
      .from('picking_libre_emissions')
      .select('status')
      .gte('created_at', oneHourAgo);

    if (recentEmissions && recentEmissions.length > 0) {
      const failed = recentEmissions.filter(e => e.status === 'failed').length;
      const total = recentEmissions.length;
      const errorRate = (failed / total) * 100;

      if (errorRate > 5) {
        alerts.push({
          severity: 'critical',
          category: 'high_error_rate',
          message: `Tasa de error elevada: ${errorRate.toFixed(2)}% (${failed}/${total})`,
          count: failed,
          details: { errorRate, failed, total }
        });
      }
    }

    // ============================================
    // 3. STOCK RESERVADO >24h sin consumir
    // ============================================
    const { data: oldReservedStock } = await supabase
      .from('stockxbin')
      .select('sku, bin, reservado')
      .gt('reservado', 0);

    if (oldReservedStock && oldReservedStock.length > 0) {
      // Verificar si hay sesiones activas para ese stock
      const { data: activeSessions } = await supabase
        .from('picking_libre_sessions')
        .select('id, last_activity_at')
        .in('status', ['escaneando', 'emitiendo'])
        .lt('last_activity_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (activeSessions && activeSessions.length > 0) {
        const totalReserved = oldReservedStock.reduce((sum, s) => sum + (s.reservado || 0), 0);
        
        alerts.push({
          severity: 'warning',
          category: 'old_reserved_stock',
          message: `${totalReserved} unidades reservadas hace >24h sin consumir`,
          count: totalReserved,
          details: { affectedBins: oldReservedStock.length, sessions: activeSessions.length }
        });
      }
    }

    // ============================================
    // 4. SESIONES ZOMBIE >10
    // ============================================
    const { data: zombies, error: zombieError } = await supabase
      .rpc('detect_zombie_sessions');

    if (zombieError) {
      console.error('Error detecting zombies:', zombieError);
    } else if (zombies && zombies.length > 10) {
      alerts.push({
        severity: 'warning',
        category: 'many_zombies',
        message: `${zombies.length} sesiones zombie detectadas`,
        count: zombies.length,
        details: zombies
      });
    }

    // ============================================
    // 5. INCONSISTENCIAS EN CONTADORES
    // ============================================
    const { data: sessions } = await supabase
      .from('picking_libre_sessions')
      .select('id, total_items, unique_products')
      .in('status', ['escaneando', 'emitiendo']);

    if (sessions) {
      for (const session of sessions) {
        const { data: items } = await supabase
          .from('picking_libre_items')
          .select('quantity, sku')
          .eq('session_id', session.id);

        if (items) {
          const actualTotal = items.reduce((sum, i) => sum + i.quantity, 0);
          const actualUnique = new Set(items.map(i => i.sku)).size;

          if (actualTotal !== session.total_items || actualUnique !== session.unique_products) {
            alerts.push({
              severity: 'warning',
              category: 'counter_mismatch',
              message: `Inconsistencia en contadores de sesión ${session.id}`,
              count: 1,
              details: {
                session_id: session.id,
                expected: { total_items: session.total_items, unique_products: session.unique_products },
                actual: { total_items: actualTotal, unique_products: actualUnique }
              }
            });
          }
        }
      }
    }

    // ============================================
    // RESULTADO FINAL
    // ============================================
    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    const warningAlerts = alerts.filter(a => a.severity === 'warning');

    console.log(`Health check completed: ${criticalAlerts.length} critical, ${warningAlerts.length} warnings`);

    // Log a audit log
    await supabase.from('picking_libre_audit_log').insert({
      event_type: 'health_check',
      event_status: criticalAlerts.length > 0 ? 'error' : warningAlerts.length > 0 ? 'warning' : 'success',
      details: {
        alerts,
        total_critical: criticalAlerts.length,
        total_warnings: warningAlerts.length
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        status: criticalAlerts.length > 0 ? 'unhealthy' : warningAlerts.length > 0 ? 'degraded' : 'healthy',
        alerts,
        summary: {
          critical: criticalAlerts.length,
          warnings: warningAlerts.length,
          info: 0
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error: any) {
    console.error('Health check error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
