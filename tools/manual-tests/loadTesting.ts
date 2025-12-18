/**
 * UTILIDADES DE LOAD TESTING - PICKING LIBRE
 * 
 * Simula 10+ usuarios concurrentes ejecutando flujo completo:
 * 1. Crear sesión
 * 2. Escanear productos
 * 3. Finalizar sesión
 * 
 * Mide tiempos y detecta errores.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

interface LoadTestResult {
  totalUsers: number;
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  errors: Array<{ operation: string; error: string; count: number }>;
}

interface OperationTiming {
  operation: string;
  duration: number;
  success: boolean;
  error?: string;
}

/**
 * Simula un usuario realizando flujo completo de picking libre
 */
async function simulateUser(userId: string): Promise<OperationTiming[]> {
  const timings: OperationTiming[] = [];

  try {
    // 1. Crear sesión
    const sessionStart = Date.now();
    const { data: session, error: sessionError } = await supabase
      .from('picking_libre_sessions')
      .insert({
        created_by: userId,
        created_by_name: `Load Test User ${userId}`,
        status: 'escaneando'
      })
      .select()
      .single();

    timings.push({
      operation: 'create_session',
      duration: Date.now() - sessionStart,
      success: !sessionError,
      error: sessionError?.message
    });

    if (sessionError || !session) {
      throw new Error('Failed to create session');
    }

    // 2. Escanear 5 productos aleatorios
    for (let i = 0; i < 5; i++) {
      const scanStart = Date.now();
      
      const { error: scanError } = await supabase
        .from('picking_libre_items')
        .insert({
          session_id: session.id,
          sku: `TEST-SKU-${Math.floor(Math.random() * 100)}`,
          bin_code: `A${Math.floor(Math.random() * 10)}-0${Math.floor(Math.random() * 9) + 1}`,
          nombre_producto: `Test Product ${i}`,
          quantity: Math.floor(Math.random() * 5) + 1
        });

      timings.push({
        operation: 'scan_product',
        duration: Date.now() - scanStart,
        success: !scanError,
        error: scanError?.message
      });

      // Simular tiempo de escaneo humano (100-500ms)
      await new Promise(resolve => setTimeout(resolve, Math.random() * 400 + 100));
    }

    // 3. Finalizar sesión
    const finalizeStart = Date.now();
    const { data: finalized, error: finalizeError } = await supabase
      .rpc('finalize_picking_session_atomic', {
        p_session_id: session.id,
        p_expected_version: session.data_version,
        p_documento_tipo: 'traslado_interno'
      });

    timings.push({
      operation: 'finalize_session',
      duration: Date.now() - finalizeStart,
      success: !finalizeError && finalized?.success,
      error: finalizeError?.message || finalized?.error_code
    });

  } catch (error: any) {
    timings.push({
      operation: 'full_flow',
      duration: 0,
      success: false,
      error: error.message
    });
  }

  return timings;
}

/**
 * Ejecuta load test con N usuarios concurrentes
 */
export async function runLoadTest(numUsers: number = 10): Promise<LoadTestResult> {
  console.log(`🚀 Starting load test with ${numUsers} concurrent users...`);
  
  const startTime = Date.now();
  
  // Ejecutar usuarios en paralelo
  const userPromises = Array.from({ length: numUsers }, (_, i) =>
    simulateUser(`load-test-user-${i}`)
  );

  const allTimings = (await Promise.all(userPromises)).flat();

  // Calcular métricas
  const durations = allTimings.map(t => t.duration).sort((a, b) => a - b);
  const successful = allTimings.filter(t => t.success).length;
  const failed = allTimings.filter(t => !t.success).length;

  const avgResponseTime = durations.reduce((a, b) => a + b, 0) / durations.length;
  const p95Index = Math.floor(durations.length * 0.95);
  const p99Index = Math.floor(durations.length * 0.99);

  // Agrupar errores
  const errorCounts = allTimings
    .filter(t => !t.success)
    .reduce((acc, t) => {
      const key = `${t.operation}: ${t.error}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  const errors = Object.entries(errorCounts).map(([key, count]) => {
    const [operation, error] = key.split(': ');
    return { operation, error, count };
  });

  const totalTime = Date.now() - startTime;

  const result: LoadTestResult = {
    totalUsers: numUsers,
    totalOperations: allTimings.length,
    successfulOperations: successful,
    failedOperations: failed,
    avgResponseTime: Math.round(avgResponseTime),
    p95ResponseTime: durations[p95Index] || 0,
    p99ResponseTime: durations[p99Index] || 0,
    errors
  };

  console.log(`✅ Load test completed in ${totalTime}ms`);
  console.log(`📊 Results:`, result);

  return result;
}

/**
 * Ejecuta load test incremental (1, 5, 10, 20 usuarios)
 */
export async function runIncrementalLoadTest(): Promise<LoadTestResult[]> {
  const userCounts = [1, 5, 10, 20];
  const results: LoadTestResult[] = [];

  for (const count of userCounts) {
    console.log(`\n🔄 Testing with ${count} users...`);
    const result = await runLoadTest(count);
    results.push(result);
    
    // Esperar 5s entre tests
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  // Resumen comparativo
  console.log('\n📈 COMPARATIVE RESULTS:');
  console.table(results.map(r => ({
    Users: r.totalUsers,
    'Success Rate': `${((r.successfulOperations / r.totalOperations) * 100).toFixed(1)}%`,
    'Avg Time (ms)': r.avgResponseTime,
    'P95 (ms)': r.p95ResponseTime,
    'P99 (ms)': r.p99ResponseTime,
    Errors: r.failedOperations
  })));

  return results;
}

/**
 * Stress test: incrementa usuarios hasta que tasa de error > 5%
 */
export async function runStressTest(): Promise<number> {
  console.log('🔥 Starting stress test...');
  
  let numUsers = 5;
  let errorRate = 0;

  while (errorRate < 0.05 && numUsers < 100) {
    const result = await runLoadTest(numUsers);
    errorRate = result.failedOperations / result.totalOperations;

    console.log(`Users: ${numUsers}, Error Rate: ${(errorRate * 100).toFixed(2)}%`);

    if (errorRate < 0.05) {
      numUsers += 5;
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  console.log(`⚠️ System limit reached at ${numUsers} concurrent users (${(errorRate * 100).toFixed(2)}% error rate)`);
  
  return numUsers;
}
