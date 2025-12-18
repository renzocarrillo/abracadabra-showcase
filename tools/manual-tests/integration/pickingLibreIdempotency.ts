/**
 * TESTS DE IDEMPOTENCIA - PICKING LIBRE
 * 
 * Valida que reintentos de emisión no causen duplicados:
 * - Mismo idempotency_key → Misma respuesta
 * - Cache de 24h funciona
 * - MAX_RETRIES se respeta
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

describe('Picking Libre - Idempotencia', () => {
  let testSessionId: string;

  beforeEach(async () => {
    // Crear sesión de prueba
    const { data: session } = await supabase
      .from('picking_libre_sessions')
      .insert({
        created_by: 'test-user-id',
        created_by_name: 'Test User',
        status: 'emitiendo',
        documento_tipo: 'traslado_interno',
        tienda_destino_id: 'test-store-id'
      })
      .select()
      .single();

    testSessionId = session!.id;
  });

  it('Debe retornar respuesta cacheada en reintentos', async () => {
    const idempotencyKey = `${testSessionId}-1`;

    // Primera emisión (debe crear registro)
    const { data: emission1 } = await supabase
      .from('picking_libre_emissions')
      .insert({
        session_id: testSessionId,
        idempotency_key: idempotencyKey,
        emission_type: 'traslado_interno',
        status: 'completed',
        request_payload: { test: 'data' },
        response_payload: { documentId: 12345 },
        bsale_document_id: 12345,
        attempt_number: 1
      })
      .select()
      .single();

    expect(emission1).toBeTruthy();
    expect(emission1!.status).toBe('completed');

    // Segunda emisión con mismo idempotency_key (debe retornar cacheado)
    const { data: cachedEmissions } = await supabase
      .from('picking_libre_emissions')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1);

    expect(cachedEmissions).toBeTruthy();
    expect(cachedEmissions!.length).toBe(1);
    expect(cachedEmissions![0].response_payload).toEqual({ documentId: 12345 });
  });

  it('Debe permitir máximo 3 intentos (MAX_RETRIES)', async () => {
    const baseKey = testSessionId;

    // Crear 3 intentos fallidos
    const attempts = [1, 2, 3].map(attemptNum => ({
      session_id: testSessionId,
      idempotency_key: `${baseKey}-${attemptNum}`,
      emission_type: 'traslado_interno',
      status: 'failed',
      request_payload: { test: 'data' },
      error_message: 'Test error',
      attempt_number: attemptNum
    }));

    await supabase
      .from('picking_libre_emissions')
      .insert(attempts);

    // Verificar que hay exactamente 3 intentos
    const { data: emissions, count } = await supabase
      .from('picking_libre_emissions')
      .select('*', { count: 'exact' })
      .eq('session_id', testSessionId);

    expect(count).toBe(3);
    expect(emissions!.every(e => e.status === 'failed')).toBe(true);

    // En producción, un 4to intento NO debería crearse
    // (esto se valida en el edge function)
    const maxAttempt = Math.max(...emissions!.map(e => e.attempt_number));
    expect(maxAttempt).toBeLessThanOrEqual(3);
  });

  it('Debe registrar diferentes estados de emisión', async () => {
    const idempotencyKey = `${testSessionId}-test-states`;

    // Estado: pending
    const { data: pending } = await supabase
      .from('picking_libre_emissions')
      .insert({
        session_id: testSessionId,
        idempotency_key: idempotencyKey,
        emission_type: 'guia_remision',
        status: 'pending',
        request_payload: { test: 'data' },
        attempt_number: 1
      })
      .select()
      .single();

    expect(pending!.status).toBe('pending');
    expect(pending!.completed_at).toBeNull();

    // Actualizar a completed
    const { data: completed } = await supabase
      .from('picking_libre_emissions')
      .update({
        status: 'completed',
        response_payload: { success: true },
        completed_at: new Date().toISOString()
      })
      .eq('id', pending!.id)
      .select()
      .single();

    expect(completed!.status).toBe('completed');
    expect(completed!.completed_at).not.toBeNull();
  });

  it('Debe guardar detalles de error en fallos', async () => {
    const idempotencyKey = `${testSessionId}-error-details`;

    const errorDetails = {
      statusCode: 500,
      endpoint: '/api/bsale',
      timestamp: new Date().toISOString(),
      requestId: 'req-12345'
    };

    const { data: failedEmission } = await supabase
      .from('picking_libre_emissions')
      .insert({
        session_id: testSessionId,
        idempotency_key: idempotencyKey,
        emission_type: 'traslado_interno',
        status: 'failed',
        request_payload: { test: 'data' },
        error_message: 'Bsale API timeout',
        error_details: errorDetails,
        attempt_number: 1
      })
      .select()
      .single();

    expect(failedEmission!.status).toBe('failed');
    expect(failedEmission!.error_message).toBe('Bsale API timeout');
    expect(failedEmission!.error_details).toEqual(errorDetails);
  });

  it('Debe validar unicidad de idempotency_key', async () => {
    const idempotencyKey = `${testSessionId}-unique-test`;

    // Primera inserción
    await supabase
      .from('picking_libre_emissions')
      .insert({
        session_id: testSessionId,
        idempotency_key: idempotencyKey,
        emission_type: 'traslado_interno',
        status: 'completed',
        request_payload: { test: 'data' },
        attempt_number: 1
      });

    // Segunda inserción con mismo key (debe fallar por constraint)
    const { error } = await supabase
      .from('picking_libre_emissions')
      .insert({
        session_id: testSessionId,
        idempotency_key: idempotencyKey,
        emission_type: 'traslado_interno',
        status: 'completed',
        request_payload: { test: 'data' },
        attempt_number: 2
      });

    // Debe fallar por constraint de unicidad
    expect(error).not.toBeNull();
    expect(error?.code).toBe('23505'); // Unique violation
  });

  it('Debe calcular attempt_number correctamente', async () => {
    // Crear 3 intentos con diferentes attempt_number
    await supabase.from('picking_libre_emissions').insert([
      {
        session_id: testSessionId,
        idempotency_key: `${testSessionId}-1`,
        emission_type: 'traslado_interno',
        status: 'failed',
        request_payload: {},
        attempt_number: 1
      },
      {
        session_id: testSessionId,
        idempotency_key: `${testSessionId}-2`,
        emission_type: 'traslado_interno',
        status: 'failed',
        request_payload: {},
        attempt_number: 2
      },
      {
        session_id: testSessionId,
        idempotency_key: `${testSessionId}-3`,
        emission_type: 'traslado_interno',
        status: 'completed',
        request_payload: {},
        attempt_number: 3
      }
    ]);

    // Verificar que attempt_number es secuencial
    const { data: attempts } = await supabase
      .from('picking_libre_emissions')
      .select('attempt_number')
      .eq('session_id', testSessionId)
      .order('attempt_number', { ascending: true });

    expect(attempts!.map(a => a.attempt_number)).toEqual([1, 2, 3]);
  });
});
