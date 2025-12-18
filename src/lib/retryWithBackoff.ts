/**
 * Generic retry helper with exponential backoff
 * Used for handling transient errors in database operations
 */

export interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  retryableErrors: string[];
  onRetry?: (attempt: number, error: any, nextDelayMs: number) => void;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 200,
  maxDelayMs: 2000,
  retryableErrors: [
    'VERSION_MISMATCH',
    'Conflicto de versión',
    'LOCK_NOT_AVAILABLE',
    'could not obtain lock',
    'bloqueada',
    'being processed'
  ]
};

/**
 * Check if an error is retryable based on its message
 */
export function isRetryableError(error: any, retryableErrors: string[]): boolean {
  const errorMessage = error?.message || error?.error_message || String(error);
  return retryableErrors.some(e => 
    errorMessage.toLowerCase().includes(e.toLowerCase())
  );
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay for a given attempt using exponential backoff
 */
export function calculateBackoffDelay(
  attempt: number, 
  initialDelayMs: number, 
  maxDelayMs: number
): number {
  const delay = initialDelayMs * Math.pow(2, attempt - 1);
  return Math.min(delay, maxDelayMs);
}

/**
 * Execute a function with automatic retries and exponential backoff
 * 
 * @param fn - The async function to execute
 * @param options - Retry configuration options
 * @returns The result of the function if successful
 * @throws The last error if all retries are exhausted
 * 
 * @example
 * ```typescript
 * const result = await retryWithBackoff(
 *   async () => {
 *     const { data, error } = await supabase.rpc('my_function');
 *     if (error) throw error;
 *     return data;
 *   },
 *   {
 *     maxRetries: 3,
 *     initialDelayMs: 200,
 *     maxDelayMs: 2000,
 *     retryableErrors: ['VERSION_MISMATCH', 'LOCK_NOT_AVAILABLE'],
 *     onRetry: (attempt, error, delay) => {
 *       console.log(`Retry ${attempt}: ${error.message}, waiting ${delay}ms`);
 *     }
 *   }
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const config: RetryOptions = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      const isRetryable = isRetryableError(error, config.retryableErrors);
      const isLastAttempt = attempt === config.maxRetries;

      if (!isRetryable || isLastAttempt) {
        throw error;
      }

      const delay = calculateBackoffDelay(attempt, config.initialDelayMs, config.maxDelayMs);
      
      config.onRetry?.(attempt, error, delay);
      
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Create a retry wrapper with pre-configured options
 * Useful for creating domain-specific retry functions
 */
export function createRetryWrapper(defaultOptions: Partial<RetryOptions>) {
  return async function<T>(
    fn: () => Promise<T>,
    overrideOptions: Partial<RetryOptions> = {}
  ): Promise<T> {
    return retryWithBackoff(fn, { ...defaultOptions, ...overrideOptions });
  };
}

// Pre-configured wrapper for picking libre operations
export const retryPickingLibreOperation = createRetryWrapper({
  maxRetries: 3,
  initialDelayMs: 200,
  maxDelayMs: 800,
  retryableErrors: [
    'VERSION_MISMATCH',
    'Conflicto de versión',
    'LOCK_NOT_AVAILABLE',
    'could not obtain lock',
    'bloqueada',
    'being processed',
    'serialization failure'
  ]
});
