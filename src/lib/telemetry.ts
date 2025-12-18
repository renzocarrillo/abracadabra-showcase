/**
 * Sistema de telemetría simplificado para Picking Libre
 * 
 * Versión inicial: logs a console y Supabase
 * Preparado para futuro upgrade a OpenTelemetry completo
 */

import { supabase } from '@/integrations/supabase/client';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface TelemetryContext {
  sessionId?: string;
  userId?: string;
  userName?: string;
  [key: string]: any;
}

interface SpanOptions {
  name: string;
  context?: TelemetryContext;
}

class SimpleTelemetry {
  private enabled: boolean = true;
  private logLevel: LogLevel = 'info';

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  setLogLevel(level: LogLevel) {
    this.logLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.enabled) return false;

    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);

    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * Log general de eventos
   */
  log(level: LogLevel, message: string, context?: TelemetryContext) {
    if (!this.shouldLog(level)) return;

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...context,
    };

    // Log a console
    const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    console[consoleMethod](`[Telemetry ${level.toUpperCase()}]`, message, context || '');

    // Log a Supabase si hay sessionId
    if (context?.sessionId && level !== 'debug') {
      this.logToSupabase(level, message, context).catch((err) => {
        console.error('Failed to log to Supabase:', err);
      });
    }
  }

  private async logToSupabase(
    level: LogLevel,
    message: string,
    context: TelemetryContext
  ) {
    try {
      const eventStatus = level === 'error' ? 'error' : level === 'warn' ? 'warning' : 'info';

      await supabase.rpc('log_picking_libre_event', {
        p_session_id: context.sessionId,
        p_event_type: context.eventType || 'general_log',
        p_event_status: eventStatus,
        p_user_id: context.userId || null,
        p_user_name: context.userName || null,
        p_details: {
          message,
          ...context,
          level,
        },
        p_error_message: level === 'error' ? message : null,
      });
    } catch (error) {
      // No propagar errores de logging
      console.error('Supabase logging failed:', error);
    }
  }

  /**
   * Inicia un "span" (operación rastreada)
   * Por ahora solo mide duración y loguea
   */
  startSpan(options: SpanOptions) {
    const startTime = performance.now();
    const spanName = options.name;

    this.log('debug', `Span started: ${spanName}`, options.context);

    return {
      end: (status: 'success' | 'error' = 'success', errorMessage?: string) => {
        const duration = Math.round(performance.now() - startTime);

        this.log(
          status === 'error' ? 'error' : 'debug',
          `Span ended: ${spanName} (${duration}ms)`,
          {
            ...options.context,
            duration_ms: duration,
            span_name: spanName,
            status,
            error_message: errorMessage,
          }
        );

        // Log a Supabase con duración
        if (options.context?.sessionId) {
          this.logToSupabase(
            status === 'error' ? 'error' : 'info',
            `${spanName} completed`,
            {
              ...options.context,
              duration_ms: duration,
              eventType: spanName.toLowerCase().replace(/\s+/g, '_'),
            }
          ).catch(() => {});
        }

        return { duration };
      },
    };
  }

  /**
   * Registra un evento específico de auditoría
   */
  async logEvent(
    sessionId: string,
    eventType: string,
    eventStatus: 'success' | 'error' | 'warning' | 'info',
    details: Record<string, any>,
    errorMessage?: string,
    stackTrace?: string
  ) {
    try {
      await supabase.rpc('log_picking_libre_event', {
        p_session_id: sessionId,
        p_event_type: eventType,
        p_event_status: eventStatus,
        p_user_id: details.userId || null,
        p_user_name: details.userName || null,
        p_details: details,
        p_error_message: errorMessage || null,
        p_stack_trace: stackTrace || null,
        p_retry_count: details.retryCount || 0,
        p_duration_ms: details.duration_ms || null,
      });

      this.log(
        eventStatus === 'error' ? 'error' : 'info',
        `Event logged: ${eventType}`,
        { sessionId, eventType, eventStatus, ...details }
      );
    } catch (error) {
      console.error('Failed to log event:', error);
      throw error;
    }
  }

  /**
   * Wrapper para ejecutar operaciones con tracing automático
   */
  async trace<T>(
    spanName: string,
    context: TelemetryContext,
    fn: () => Promise<T>
  ): Promise<T> {
    const span = this.startSpan({ name: spanName, context });

    try {
      const result = await fn();
      span.end('success');
      return result;
    } catch (error) {
      span.end('error', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }
}

// Instancia singleton
export const telemetry = new SimpleTelemetry();

// Exports de conveniencia
export const logInfo = (message: string, context?: TelemetryContext) =>
  telemetry.log('info', message, context);

export const logWarn = (message: string, context?: TelemetryContext) =>
  telemetry.log('warn', message, context);

export const logError = (message: string, context?: TelemetryContext) =>
  telemetry.log('error', message, context);

export const logDebug = (message: string, context?: TelemetryContext) =>
  telemetry.log('debug', message, context);
