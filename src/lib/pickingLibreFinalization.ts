/**
 * Picking Libre Finalization Wrapper
 * 
 * Handles session finalization with:
 * - Fresh data_version read before each attempt
 * - Exponential backoff retry logic
 * - Idempotent execution (no re-execution after success)
 * - Telemetry logging
 */

import { supabase } from '@/integrations/supabase/client';
import { retryWithBackoff, calculateBackoffDelay, isRetryableError } from './retryWithBackoff';
import { telemetry, logInfo, logWarn, logError } from './telemetry';

export interface FinalizationParams {
  sessionId: string;
  documentType: 'traslado_interno' | 'guia_remision';
  selectedStore: string;
  selectedTransportist?: string | null;
  notes?: string | null;
}

export interface FinalizationCallbacks {
  onRetrying?: (attempt: number, reason: string, delayMs: number) => void;
  onSuccess?: (result: FinalizationResult) => void;
  onFreshVersionRead?: (version: number) => void;
}

export interface FinalizationResult {
  success: boolean;
  finalizeData?: any;
  attemptsNeeded: number;
  newVersion?: number;
  newStatus?: string;
  error?: string;
  errorCode?: string;
}

const RETRYABLE_ERRORS = [
  'VERSION_MISMATCH',
  'Conflicto de versión',
  'LOCK_NOT_AVAILABLE',
  'could not obtain lock',
  'bloqueada',
  'being processed',
  'serialization failure'
];

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 200;
const MAX_DELAY_MS = 800;

/**
 * Read fresh data_version from the database
 */
async function readFreshDataVersion(sessionId: string): Promise<{ version: number; status: string } | null> {
  const { data, error } = await supabase
    .from('picking_libre_sessions')
    .select('data_version, status')
    .eq('id', sessionId)
    .single();

  if (error || !data) {
    logError('Failed to read fresh data_version', { sessionId, error: error?.message });
    return null;
  }

  return { version: data.data_version, status: data.status };
}

/**
 * Execute finalize_picking_session_atomic with the given parameters
 */
async function executeFinalization(
  params: FinalizationParams,
  expectedVersion: number
): Promise<{ success: boolean; data?: any; error?: string }> {
  const { data, error } = await supabase.rpc('finalize_picking_session_atomic', {
    p_session_id: params.sessionId,
    p_expected_version: expectedVersion,
    p_documento_tipo: params.documentType,
    p_tienda_destino_id: params.selectedStore,
    p_transportista_id: params.documentType === 'guia_remision' ? params.selectedTransportist : null,
    p_notes: params.notes || null
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const result = Array.isArray(data) ? data[0] : data;
  
  if (!result?.success) {
    return { 
      success: false, 
      error: result?.error_message || 'Error desconocido al finalizar sesión',
      data: result
    };
  }

  return { success: true, data: result };
}

/**
 * Get human-readable reason for retry
 */
function getRetryReason(error: string): string {
  if (error.includes('VERSION_MISMATCH') || error.includes('Conflicto de versión')) {
    return 'Otro proceso actualizó la sesión';
  }
  if (error.includes('LOCK_NOT_AVAILABLE') || error.includes('could not obtain lock')) {
    return 'El inventario está siendo actualizado';
  }
  if (error.includes('bloqueada') || error.includes('being processed')) {
    return 'La sesión está siendo procesada';
  }
  return 'Error temporal de base de datos';
}

/**
 * Main finalization function with retry logic
 * 
 * Key guarantees:
 * 1. Fresh data_version is read BEFORE each attempt
 * 2. Retries only on recoverable errors
 * 3. Never re-executes after success (idempotent)
 * 4. Logs all attempts for audit/debugging
 */
export async function finalizeSessionWithRetry(
  params: FinalizationParams,
  callbacks: FinalizationCallbacks = {}
): Promise<FinalizationResult> {
  const startTime = Date.now();
  let attemptsNeeded = 0;
  let lastError: string | undefined;
  let lastErrorCode: string | undefined;

  logInfo('Starting finalization with retry', { 
    sessionId: params.sessionId,
    documentType: params.documentType 
  });

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    attemptsNeeded = attempt;
    
    try {
      // CRITICAL: Read fresh data_version BEFORE each attempt
      const freshData = await readFreshDataVersion(params.sessionId);
      
      if (!freshData) {
        throw new Error('La sesión ha expirado o ya fue completada. Por favor, inicia una nueva sesión.');
      }

      callbacks.onFreshVersionRead?.(freshData.version);

      // Validate session status
      if (!['en_proceso', 'verificado'].includes(freshData.status)) {
        // If already 'completado', return success
        if (freshData.status === 'completado') {
          logWarn('Session already completed, returning success', { sessionId: params.sessionId });
          return {
            success: true,
            attemptsNeeded,
            newStatus: 'completado'
          };
        }
        
        // If stuck in 'emitiendo', check if we can recover and retry
        if (freshData.status === 'emitiendo') {
          const { data: session } = await supabase
            .from('picking_libre_sessions')
            .select('updated_at, last_error')
            .eq('id', params.sessionId)
            .single();
          
          const updatedAt = new Date(session?.updated_at || Date.now());
          const minutesSinceUpdate = (Date.now() - updatedAt.getTime()) / 60000;
          
          // Allow retry if stuck for >2 minutes OR has last_error (indicating previous failure)
          if (minutesSinceUpdate > 2 || session?.last_error) {
            logWarn('Session stuck in emitiendo, allowing retry', { 
              sessionId: params.sessionId, 
              minutesSinceUpdate: minutesSinceUpdate.toFixed(1),
              lastError: session?.last_error
            });
            // Continue with finalization - will get fresh version on next attempt
          } else {
            throw new Error(`La sesión está siendo procesada. Si persiste por más de 2 minutos, intenta nuevamente.`);
          }
        } else {
          throw new Error(`La sesión está en estado "${freshData.status}" y no puede ser finalizada.`);
        }
      }

      logInfo(`Attempt ${attempt}/${MAX_RETRIES}`, { 
        sessionId: params.sessionId,
        version: freshData.version,
        status: freshData.status
      });

      // Execute finalization with fresh version
      const result = await executeFinalization(params, freshData.version);

      if (result.success) {
        const duration = Date.now() - startTime;
        
        logInfo('Finalization successful', { 
          sessionId: params.sessionId,
          attemptsNeeded,
          durationMs: duration,
          newVersion: result.data?.new_version,
          newStatus: result.data?.new_status
        });

        // Log to audit
        await telemetry.logEvent(
          params.sessionId,
          'finalization_success',
          'success',
          { attemptsNeeded, durationMs: duration, newVersion: result.data?.new_version }
        );

        const finalResult: FinalizationResult = {
          success: true,
          finalizeData: result.data,
          attemptsNeeded,
          newVersion: result.data?.new_version,
          newStatus: result.data?.new_status
        };

        callbacks.onSuccess?.(finalResult);
        return finalResult;
      }

      // Check if error is retryable
      lastError = result.error || 'Error desconocido';
      lastErrorCode = result.data?.error_code;

      const isRetryable = isRetryableError({ message: lastError }, RETRYABLE_ERRORS);
      const isLastAttempt = attempt === MAX_RETRIES;

      if (!isRetryable || isLastAttempt) {
        logError('Finalization failed (non-retryable or max attempts)', { 
          sessionId: params.sessionId,
          error: lastError,
          isRetryable,
          isLastAttempt,
          attempt
        });
        throw new Error(lastError);
      }

      // Calculate delay and notify
      const delay = calculateBackoffDelay(attempt, INITIAL_DELAY_MS, MAX_DELAY_MS);
      const reason = getRetryReason(lastError);

      logWarn(`Retrying finalization: ${reason}`, { 
        sessionId: params.sessionId,
        attempt,
        delay,
        error: lastError
      });

      callbacks.onRetrying?.(attempt, reason, delay);

      // Log retry attempt to audit
      await telemetry.logEvent(
        params.sessionId,
        'finalization_retry',
        'warning',
        { attempt, reason, delay, error: lastError }
      );

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay));

    } catch (error: any) {
      lastError = error.message || 'Error desconocido';
      
      const isRetryable = isRetryableError(error, RETRYABLE_ERRORS);
      const isLastAttempt = attempt === MAX_RETRIES;

      if (!isRetryable || isLastAttempt) {
        const duration = Date.now() - startTime;
        
        logError('Finalization failed', { 
          sessionId: params.sessionId,
          error: lastError,
          attemptsNeeded,
          durationMs: duration
        });

        // Log to audit
        await telemetry.logEvent(
          params.sessionId,
          'finalization_failed',
          'error',
          { attemptsNeeded, durationMs: duration },
          lastError
        );

        return {
          success: false,
          attemptsNeeded,
          error: lastError,
          errorCode: lastErrorCode
        };
      }

      // Retry logic for caught exceptions
      const delay = calculateBackoffDelay(attempt, INITIAL_DELAY_MS, MAX_DELAY_MS);
      const reason = getRetryReason(lastError);

      callbacks.onRetrying?.(attempt, reason, delay);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Should not reach here, but just in case
  return {
    success: false,
    attemptsNeeded,
    error: lastError || 'Se agotaron los reintentos',
    errorCode: 'MAX_RETRIES_EXCEEDED'
  };
}
