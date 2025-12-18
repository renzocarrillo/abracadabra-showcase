/**
 * Helpers para gestión de stock en Picking Libre - FASE 5 (Sistema 2 Estados)
 * 
 * Sistema simplificado: disponibles ↔ reservado
 * Fórmula: en_existencia = disponibles + reservado
 * 
 * NO USA comprometido (solo para ventas normales)
 */

import { supabase } from '@/integrations/supabase/client';
import { telemetry } from './telemetry';

export interface StockItem {
  sku: string;
  bin: string;
  quantity: number;
  stock_id: string;
}

export interface ReserveStockResult {
  success: boolean;
  error?: string;
  code?: string;
  message?: string;
  total_reserved?: number;
  details?: any;
}

export interface ConsumeStockResult {
  success: boolean;
  error_message?: string;
  items_updated?: number;
  new_version?: number;
}

/**
 * Reserva stock para una sesión de picking libre (SISTEMA 2 ESTADOS)
 * 
 * Mueve stock de disponibles → reservado con validaciones estrictas:
 * - Verifica bins no congelados
 * - Verifica productos no congelados
 * - Valida disponibilidad suficiente
 * - Usa bloqueo pesimista (FOR UPDATE NOWAIT) para prevenir race conditions
 * 
 * IMPORTANTE: Debe llamarse ANTES de emitir a Bsale
 * 
 * @param sessionId - ID de la sesión de picking
 * @param items - Array de items a reservar
 * @param userId - ID del usuario que reserva
 * @param userName - Nombre del usuario que reserva
 * @returns Resultado de la reserva
 */
export async function reserveStockForSession(
  sessionId: string,
  items: StockItem[],
  userId: string,
  userName: string
): Promise<ReserveStockResult> {
  const span = telemetry.startSpan({
    name: 'reserve_stock_for_session',
    context: { sessionId, userId, userName, itemCount: items.length },
  });

  try {
    telemetry.log('info', 'Reservando stock (Fase 5)', {
      sessionId,
      itemCount: items.length,
      eventType: 'stock_reservation_attempt',
    });

    const { data, error } = await supabase.rpc('reserve_stock_for_session', {
      p_session_id: sessionId,
      p_items: items as any, // Cast para JSON
      p_user_id: userId,
      p_user_name: userName,
    });

    if (error) {
      span.end('error', error.message);
      throw error;
    }

    const result = data as unknown as ReserveStockResult;

    if (!result.success) {
      span.end('error', result.error || 'Reservation failed');
      telemetry.log('warn', `Reserva fallida: ${result.error}`, {
        sessionId,
        error: result.error,
        code: result.code,
        details: result.details,
        eventType: 'stock_reservation_failed',
      });
    } else {
      span.end('success');
      telemetry.log('info', 'Stock reservado exitosamente', {
        sessionId,
        totalReserved: result.total_reserved,
        eventType: 'stock_reserved',
      });
    }

    return result;
  } catch (error) {
    span.end('error', error instanceof Error ? error.message : String(error));
    telemetry.log('error', 'Error al reservar stock', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
      eventType: 'stock_reservation_error',
    });
    throw error;
  }
}

/**
 * Libera reservas de stock si falla la emisión (SISTEMA 2 ESTADOS)
 * 
 * Mueve stock de reservado → disponibles
 * 
 * @param sessionId - ID de la sesión de picking
 * @returns Resultado de la liberación
 */
export async function releaseStockReservation(
  sessionId: string
): Promise<{ success: boolean; items_released?: number; error_message?: string }> {
  const span = telemetry.startSpan({
    name: 'release_stock_reservation',
    context: { sessionId },
  });

  try {
    telemetry.log('info', 'Liberando reservas de stock', {
      sessionId,
      eventType: 'stock_release_attempt',
    });

    const { data, error } = await supabase.rpc('release_stock_reservation', {
      p_session_id: sessionId,
    });

    if (error) {
      span.end('error', error.message);
      throw error;
    }

    const result = data as unknown as { success: boolean; items_released?: number; error_message?: string };

    if (result.success) {
      span.end('success');
      telemetry.log('info', 'Reservas liberadas exitosamente', {
        sessionId,
        itemsReleased: result.items_released,
        eventType: 'stock_released',
      });
    }

    return result;
  } catch (error) {
    span.end('error', error instanceof Error ? error.message : String(error));
    telemetry.log('error', 'Error al liberar reservas', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
      eventType: 'stock_release_error',
    });
    throw error;
  }
}

/**
 * Consume stock después de emisión exitosa de documento Bsale (SISTEMA 2 ESTADOS)
 * 
 * Mueve stock de reservado → 0 (reduce reservado directamente)
 * El trigger calculate_en_existencia recalcula automáticamente en_existencia
 * Marca sesión como completada
 * Usa bloqueo optimista con data_version para prevenir race conditions
 * 
 * IMPORTANTE: Solo debe llamarse después de que Bsale confirme el documento
 * NO USA comprometido (solo disponibles y reservado)
 * 
 * @param sessionId - ID de la sesión de picking
 * @param expectedVersion - Versión esperada de la sesión (para bloqueo optimista)
 * @returns Resultado del consumo
 */
export async function consumePickingLibreStockStrict(
  sessionId: string,
  expectedVersion?: number
): Promise<ConsumeStockResult> {
  const span = telemetry.startSpan({
    name: 'consume_picking_libre_stock_strict',
    context: { sessionId, expectedVersion },
  });

  try {
    telemetry.log('info', 'Consumiendo stock (Fase 5 Strict)', {
      sessionId,
      expectedVersion,
      eventType: 'stock_consumption_attempt',
    });

    const { data, error } = await supabase.rpc('consume_picking_libre_stock_strict', {
      p_session_id: sessionId,
      p_expected_version: expectedVersion || null,
    });

    if (error) {
      span.end('error', error.message);
      throw error;
    }

    const result = data?.[0] as unknown as ConsumeStockResult;

    if (!result?.success) {
      span.end('error', result?.error_message || 'Consumption failed');
      telemetry.log('warn', `Consumo fallido: ${result?.error_message}`, {
        sessionId,
        error: result?.error_message,
        eventType: 'stock_consumption_failed',
      });
    } else {
      span.end('success');
      telemetry.log('info', 'Stock consumido exitosamente', {
        sessionId,
        itemsUpdated: result.items_updated,
        newVersion: result.new_version,
        eventType: 'stock_consumed',
      });
    }

    return result;
  } catch (error) {
    span.end('error', error instanceof Error ? error.message : String(error));
    telemetry.log('error', 'Error al consumir stock', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
      eventType: 'stock_consumption_error',
    });
    throw error;
  }
}

/**
 * Valida si una sesión está lista para reservar stock
 * 
 * @param session - Sesión de picking
 * @returns true si está lista para reservar
 */
export function canReserveStock(session: any): boolean {
  return !!(
    session &&
    session.sessionId &&
    session.status === 'VERIFICATION_MODE' &&
    session.scannedItems &&
    session.scannedItems.length > 0
  );
}
