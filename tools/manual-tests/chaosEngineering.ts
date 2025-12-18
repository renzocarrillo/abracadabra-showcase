/**
 * CHAOS ENGINEERING - PICKING LIBRE
 * 
 * Inyecta fallos controlados para validar resiliencia:
 * - Fallos de Bsale API
 * - Timeouts de DB
 * - Network latency
 * - Sesiones zombie inducidas
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

interface ChaosTestResult {
  scenario: string;
  success: boolean;
  recovered: boolean;
  details: string;
  duration: number;
}

/**
 * Simula fallo de Bsale API (timeout/500/503)
 */
export async function simulateBsaleFailure(): Promise<ChaosTestResult> {
  const startTime = Date.now();
  
  console.log('🔥 CHAOS: Simulando fallo de Bsale API...');

  try {
    // Crear sesión y finalizarla (edge function intentará llamar a Bsale)
    const { data: session } = await supabase
      .from('picking_libre_sessions')
      .insert({
        created_by: 'chaos-test',
        created_by_name: 'Chaos Test',
        status: 'escaneando',
        documento_tipo: 'traslado_interno',
        tienda_destino_id: 'invalid-store-to-force-error'
      })
      .select()
      .single();

    if (!session) throw new Error('Failed to create session');

    // Agregar items
    await supabase.from('picking_libre_items').insert([
      {
        session_id: session.id,
        sku: 'CHAOS-SKU-001',
        bin_code: 'Z9-99',
        nombre_producto: 'Chaos Product',
        quantity: 1
      }
    ]);

    // Intentar finalizar (debería fallar por store inválida)
    const { data: finalized } = await supabase
      .rpc('finalize_picking_session_atomic', {
        p_session_id: session.id,
        p_expected_version: session.data_version,
        p_documento_tipo: 'traslado_interno'
      });

    // Verificar que se registró el error
    const { data: emissions } = await supabase
      .from('picking_libre_emissions')
      .select('*')
      .eq('session_id', session.id);

    const hasErrorRecorded = emissions && emissions.some(e => e.status === 'failed');

    // Verificar que sesión está en estado recuperable
    const { data: updatedSession } = await supabase
      .from('picking_libre_sessions')
      .select('status, last_error')
      .eq('id', session.id)
      .single();

    const recovered = updatedSession?.status !== 'emitiendo';

    return {
      scenario: 'Bsale API Failure',
      success: !finalized?.success, // Esperamos que falle
      recovered,
      details: `Error recorded: ${hasErrorRecorded}, Session status: ${updatedSession?.status}`,
      duration: Date.now() - startTime
    };

  } catch (error: any) {
    return {
      scenario: 'Bsale API Failure',
      success: false,
      recovered: false,
      details: error.message,
      duration: Date.now() - startTime
    };
  }
}

/**
 * Simula lock timeout en DB
 */
export async function simulateLockTimeout(): Promise<ChaosTestResult> {
  const startTime = Date.now();
  
  console.log('🔥 CHAOS: Simulando lock timeout...');

  try {
    const { data: session } = await supabase
      .from('picking_libre_sessions')
      .insert({
        created_by: 'chaos-test',
        created_by_name: 'Chaos Test',
        status: 'escaneando'
      })
      .select()
      .single();

    if (!session) throw new Error('Failed to create session');

    // Intentar 2 actualizaciones concurrentes con lock
    const [result1, result2] = await Promise.allSettled([
      supabase.rpc('update_session_with_lock', {
        p_session_id: session.id,
        p_expected_version: session.data_version,
        p_new_status: 'emitiendo'
      }),
      supabase.rpc('update_session_with_lock', {
        p_session_id: session.id,
        p_expected_version: session.data_version,
        p_new_status: 'completado'
      })
    ]);

    // Una debe tener éxito, la otra debe fallar
    const oneSucceeded = result1.status === 'fulfilled' || result2.status === 'fulfilled';
    const oneFailed = result1.status === 'rejected' || result2.status === 'rejected';

    return {
      scenario: 'DB Lock Timeout',
      success: oneSucceeded && oneFailed,
      recovered: true,
      details: `Result1: ${result1.status}, Result2: ${result2.status}`,
      duration: Date.now() - startTime
    };

  } catch (error: any) {
    return {
      scenario: 'DB Lock Timeout',
      success: false,
      recovered: false,
      details: error.message,
      duration: Date.now() - startTime
    };
  }
}

/**
 * Simula red lenta (latencia artificial)
 */
export async function simulateNetworkLatency(delayMs: number = 2000): Promise<ChaosTestResult> {
  const startTime = Date.now();
  
  console.log(`🔥 CHAOS: Simulando latencia de ${delayMs}ms...`);

  try {
    const { data: session } = await supabase
      .from('picking_libre_sessions')
      .insert({
        created_by: 'chaos-test',
        created_by_name: 'Chaos Test',
        status: 'escaneando'
      })
      .select()
      .single();

    if (!session) throw new Error('Failed to create session');

    // Esperar artificialmente
    await new Promise(resolve => setTimeout(resolve, delayMs));

    // Intentar operación después de delay
    const { data: updated } = await supabase
      .from('picking_libre_sessions')
      .update({ notes: 'Latency test' })
      .eq('id', session.id)
      .select()
      .single();

    return {
      scenario: `Network Latency (${delayMs}ms)`,
      success: !!updated,
      recovered: true,
      details: 'Operation completed despite latency',
      duration: Date.now() - startTime
    };

  } catch (error: any) {
    return {
      scenario: `Network Latency (${delayMs}ms)`,
      success: false,
      recovered: false,
      details: error.message,
      duration: Date.now() - startTime
    };
  }
}

/**
 * Crea sesión zombie inducida para validar recovery
 */
export async function simulateZombieSession(): Promise<ChaosTestResult> {
  const startTime = Date.now();
  
  console.log('🔥 CHAOS: Creando sesión zombie inducida...');

  try {
    // Crear sesión "abandonada" (hace 20 minutos)
    const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();

    const { data: session } = await supabase
      .from('picking_libre_sessions')
      .insert({
        created_by: 'chaos-test',
        created_by_name: 'Chaos Test',
        status: 'escaneando',
        created_at: twentyMinutesAgo,
        last_activity_at: twentyMinutesAgo
      })
      .select()
      .single();

    if (!session) throw new Error('Failed to create zombie session');

    // Agregar items con stock reservado
    await supabase.from('picking_libre_items').insert([
      {
        session_id: session.id,
        sku: 'ZOMBIE-SKU',
        bin_code: 'Z1-01',
        nombre_producto: 'Zombie Product',
        quantity: 5
      }
    ]);

    // Ejecutar detección de zombies
    const { data: zombies } = await supabase.rpc('detect_zombie_sessions');

    const isDetected = zombies && zombies.some((z: any) => z.session_id === session.id);

    // Ejecutar recovery
    if (isDetected) {
      const { data: recovered } = await supabase.rpc('recover_zombie_session', {
        p_session_id: session.id
      });

      return {
        scenario: 'Zombie Session Induction',
        success: isDetected,
        recovered: recovered?.success || false,
        details: `Detected: ${isDetected}, Recovered: ${recovered?.success}, Action: ${recovered?.action}`,
        duration: Date.now() - startTime
      };
    }

    return {
      scenario: 'Zombie Session Induction',
      success: false,
      recovered: false,
      details: 'Zombie not detected',
      duration: Date.now() - startTime
    };

  } catch (error: any) {
    return {
      scenario: 'Zombie Session Induction',
      success: false,
      recovered: false,
      details: error.message,
      duration: Date.now() - startTime
    };
  }
}

/**
 * Ejecuta todos los escenarios de chaos
 */
export async function runAllChaosTests(): Promise<ChaosTestResult[]> {
  console.log('🔥🔥🔥 STARTING CHAOS ENGINEERING TESTS 🔥🔥🔥\n');

  const results: ChaosTestResult[] = [];

  // Test 1: Bsale failure
  results.push(await simulateBsaleFailure());
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 2: Lock timeout
  results.push(await simulateLockTimeout());
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 3: Network latency
  results.push(await simulateNetworkLatency(3000));
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 4: Zombie session
  results.push(await simulateZombieSession());

  // Resumen
  console.log('\n📊 CHAOS TESTS SUMMARY:');
  console.table(results.map(r => ({
    Scenario: r.scenario,
    'Success': r.success ? '✅' : '❌',
    'Recovered': r.recovered ? '✅' : '❌',
    'Duration (ms)': r.duration,
    Details: r.details
  })));

  const allPassed = results.every(r => r.success && r.recovered);
  console.log(allPassed ? '\n✅ ALL CHAOS TESTS PASSED' : '\n⚠️ SOME CHAOS TESTS FAILED');

  return results;
}
