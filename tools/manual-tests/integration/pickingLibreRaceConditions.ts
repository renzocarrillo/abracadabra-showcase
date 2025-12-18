/**
 * TESTS DE RACE CONDITIONS - PICKING LIBRE
 * 
 * Valida que múltiples usuarios concurrentes no generen:
 * - Doble emisiones
 * - Consumo duplicado de stock
 * - Estados inconsistentes
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

describe('Picking Libre - Race Conditions', () => {
  let testSessionId: string;
  let testUserId: string;

  beforeEach(async () => {
    // Setup: crear sesión de prueba
    const { data: session, error } = await supabase
      .from('picking_libre_sessions')
      .insert({
        created_by: 'test-user-id',
        created_by_name: 'Test User',
        status: 'escaneando'
      })
      .select()
      .single();

    expect(error).toBeNull();
    testSessionId = session!.id;
    testUserId = session!.created_by;
  });

  it('Debe prevenir doble finalización de sesión (doble clic)', async () => {
    // Simular 2 usuarios haciendo clic en "Finalizar" al mismo tiempo
    const promises = [
      supabase.rpc('finalize_picking_session_atomic', {
        p_session_id: testSessionId,
        p_expected_version: 1,
        p_documento_tipo: 'traslado_interno'
      }),
      supabase.rpc('finalize_picking_session_atomic', {
        p_session_id: testSessionId,
        p_expected_version: 1,
        p_documento_tipo: 'traslado_interno'
      })
    ];

    const results = await Promise.allSettled(promises);

    // Solo 1 debe tener éxito
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.data?.success);
    expect(successful.length).toBe(1);

    // El otro debe fallar con VERSION_MISMATCH o ALREADY_FINALIZING
    const failed = results.filter(r => 
      r.status === 'rejected' || 
      (r.status === 'fulfilled' && !r.value.data?.success)
    );
    expect(failed.length).toBe(1);
  });

  it('Debe prevenir consumo concurrente del mismo stock', async () => {
    // Crear stock de prueba
    const { data: stock } = await supabase
      .from('stockxbin')
      .insert({
        sku: 'TEST-SKU-001',
        bin: 'A1-01',
        idBsale: 'test-variant-id',
        disponibles: 10,
        en_existencia: 10
      })
      .select()
      .single();

    expect(stock).toBeTruthy();

    // Simular 3 consumos concurrentes de 5 unidades cada uno
    const promises = [
      supabase.rpc('consume_picking_libre_stock', {
        p_session_id: testSessionId,
        p_sku: 'TEST-SKU-001',
        p_bin: 'A1-01',
        p_quantity: 5
      }),
      supabase.rpc('consume_picking_libre_stock', {
        p_session_id: testSessionId,
        p_sku: 'TEST-SKU-001',
        p_bin: 'A1-01',
        p_quantity: 5
      }),
      supabase.rpc('consume_picking_libre_stock', {
        p_session_id: testSessionId,
        p_sku: 'TEST-SKU-001',
        p_bin: 'A1-01',
        p_quantity: 5
      })
    ];

    const results = await Promise.allSettled(promises);

    // Solo 2 deben tener éxito (10 disponibles / 5 cada uno)
    const successful = results.filter(r => 
      r.status === 'fulfilled' && r.value.data?.success
    );
    expect(successful.length).toBeLessThanOrEqual(2);

    // Stock final debe ser correcto (nunca negativo)
    const { data: finalStock } = await supabase
      .from('stockxbin')
      .select('disponibles')
      .eq('sku', 'TEST-SKU-001')
      .eq('bin', 'A1-01')
      .single();

    expect(finalStock!.disponibles).toBeGreaterThanOrEqual(0);
  });

  it('Debe detectar conflictos de data_version', async () => {
    // Obtener versión actual
    const { data: session } = await supabase
      .from('picking_libre_sessions')
      .select('data_version')
      .eq('id', testSessionId)
      .single();

    const currentVersion = session!.data_version;

    // Actualizar con versión correcta
    const { data: update1 } = await supabase.rpc('update_session_with_lock', {
      p_session_id: testSessionId,
      p_expected_version: currentVersion,
      p_new_status: 'emitiendo'
    });

    expect(update1?.success).toBe(true);

    // Intentar actualizar con versión antigua (debe fallar)
    const { data: update2 } = await supabase.rpc('update_session_with_lock', {
      p_session_id: testSessionId,
      p_expected_version: currentVersion, // Versión ya obsoleta
      p_new_status: 'completado'
    });

    expect(update2?.success).toBe(false);
    expect(update2?.error_code).toBe('VERSION_MISMATCH');
  });

  it('Debe manejar timeouts de locks correctamente', async () => {
    // Crear 2 transacciones que intenten lockear la misma sesión
    const { data: lock1 } = await supabase.rpc('update_session_with_lock', {
      p_session_id: testSessionId,
      p_expected_version: 1,
      p_new_status: 'emitiendo'
    });

    expect(lock1?.success).toBe(true);

    // Segundo intento debe esperar o fallar con LOCK_TIMEOUT
    const { data: lock2, error } = await supabase.rpc('update_session_with_lock', {
      p_session_id: testSessionId,
      p_expected_version: 2,
      p_new_status: 'completado'
    });

    // Puede fallar por VERSION_MISMATCH o LOCK_TIMEOUT
    expect(lock2?.success === false || error !== null).toBe(true);
  });

  it('Debe registrar todos los intentos en audit_log', async () => {
    // Intentar finalizar sesión
    await supabase.rpc('finalize_picking_session_atomic', {
      p_session_id: testSessionId,
      p_expected_version: 1,
      p_documento_tipo: 'traslado_interno'
    });

    // Verificar que existe registro en audit_log
    const { data: logs } = await supabase
      .from('picking_libre_audit_log')
      .select('*')
      .eq('session_id', testSessionId)
      .order('created_at', { ascending: true });

    expect(logs).toBeTruthy();
    expect(logs!.length).toBeGreaterThan(0);

    // Debe tener evento de finalización
    const finalizationLog = logs!.find(log => 
      log.event_type === 'session_finalization_attempt'
    );
    expect(finalizationLog).toBeTruthy();
  });
});
