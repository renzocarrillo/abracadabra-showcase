/**
 * Helpers para auditoría de Picking Libre
 * 
 * Funciones de conveniencia para registrar eventos de auditoría
 * en el sistema de picking libre
 */

import { supabase } from '@/integrations/supabase/client';

export type AuditEventType =
  | 'session_created'
  | 'session_resumed'
  | 'bin_scanned'
  | 'item_scanned'
  | 'verification_started'
  | 'verification_product_scanned'
  | 'finalize_attempt'
  | 'stock_consumption_attempt'
  | 'stock_consumed'
  | 'bsale_document_created'
  | 'session_completed'
  | 'session_cancelled'
  | 'session_error'
  | 'recovery_attempt'
  | 'zombie_detected';

export type AuditEventStatus = 'success' | 'error' | 'warning' | 'info';

interface AuditEventOptions {
  sessionId: string;
  eventType: AuditEventType;
  eventStatus: AuditEventStatus;
  userId?: string;
  userName?: string;
  details?: Record<string, any>;
  errorMessage?: string;
  stackTrace?: string;
  retryCount?: number;
  durationMs?: number;
}

/**
 * Registra un evento de auditoría en la base de datos
 */
export async function logPickingLibreEvent(options: AuditEventOptions): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('log_picking_libre_event', {
      p_session_id: options.sessionId,
      p_event_type: options.eventType,
      p_event_status: options.eventStatus,
      p_user_id: options.userId || null,
      p_user_name: options.userName || null,
      p_details: options.details || {},
      p_error_message: options.errorMessage || null,
      p_stack_trace: options.stackTrace || null,
      p_retry_count: options.retryCount || 0,
      p_duration_ms: options.durationMs || null,
    });

    if (error) {
      console.error('Error logging picking libre event:', error);
      return null;
    }

    return data as string;
  } catch (error) {
    console.error('Failed to log picking libre event:', error);
    return null;
  }
}

/**
 * Funciones de conveniencia para eventos comunes
 */

export async function logSessionCreated(
  sessionId: string,
  userId: string,
  userName: string,
  details?: Record<string, any>
) {
  return logPickingLibreEvent({
    sessionId,
    eventType: 'session_created',
    eventStatus: 'success',
    userId,
    userName,
    details,
  });
}

export async function logSessionResumed(
  sessionId: string,
  userId: string,
  userName: string,
  details?: Record<string, any>
) {
  return logPickingLibreEvent({
    sessionId,
    eventType: 'session_resumed',
    eventStatus: 'info',
    userId,
    userName,
    details,
  });
}

export async function logItemScanned(
  sessionId: string,
  userId: string,
  userName: string,
  details: { sku: string; binCode: string; quantity: number; [key: string]: any }
) {
  return logPickingLibreEvent({
    sessionId,
    eventType: 'item_scanned',
    eventStatus: 'success',
    userId,
    userName,
    details,
  });
}

export async function logVerificationStarted(
  sessionId: string,
  userId: string,
  userName: string,
  details?: Record<string, any>
) {
  return logPickingLibreEvent({
    sessionId,
    eventType: 'verification_started',
    eventStatus: 'info',
    userId,
    userName,
    details,
  });
}

export async function logFinalizeAttempt(
  sessionId: string,
  userId: string,
  userName: string,
  success: boolean,
  details?: Record<string, any>,
  errorMessage?: string,
  durationMs?: number
) {
  return logPickingLibreEvent({
    sessionId,
    eventType: 'finalize_attempt',
    eventStatus: success ? 'success' : 'error',
    userId,
    userName,
    details,
    errorMessage,
    durationMs,
  });
}

export async function logStockConsumed(
  sessionId: string,
  userId: string,
  userName: string,
  details?: Record<string, any>,
  durationMs?: number
) {
  return logPickingLibreEvent({
    sessionId,
    eventType: 'stock_consumed',
    eventStatus: 'success',
    userId,
    userName,
    details,
    durationMs,
  });
}

export async function logBsaleDocumentCreated(
  sessionId: string,
  userId: string,
  userName: string,
  details: { documentId?: string; documentUrl?: string; [key: string]: any }
) {
  return logPickingLibreEvent({
    sessionId,
    eventType: 'bsale_document_created',
    eventStatus: 'success',
    userId,
    userName,
    details,
  });
}

export async function logSessionError(
  sessionId: string,
  userId: string | undefined,
  userName: string | undefined,
  errorMessage: string,
  details?: Record<string, any>,
  stackTrace?: string
) {
  return logPickingLibreEvent({
    sessionId,
    eventType: 'session_error',
    eventStatus: 'error',
    userId,
    userName,
    details,
    errorMessage,
    stackTrace,
  });
}

export async function logRecoveryAttempt(
  sessionId: string,
  retryCount: number,
  success: boolean,
  details?: Record<string, any>,
  errorMessage?: string
) {
  return logPickingLibreEvent({
    sessionId,
    eventType: 'recovery_attempt',
    eventStatus: success ? 'success' : 'error',
    retryCount,
    details,
    errorMessage,
  });
}

export async function logZombieDetected(
  sessionId: string,
  details: {
    minutesInactive: number;
    currentRetryCount: number;
    [key: string]: any;
  }
) {
  return logPickingLibreEvent({
    sessionId,
    eventType: 'zombie_detected',
    eventStatus: 'warning',
    details,
  });
}
