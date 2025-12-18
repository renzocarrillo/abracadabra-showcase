import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface FeatureFlagResponse {
  found: boolean;
  is_enabled: boolean;
  config: Record<string, any>;
  cache_timestamp: number;
}

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutos
const CACHE_KEY_PREFIX = 'feature_flag_';

/**
 * Hook para obtener el estado de un feature flag con cache en localStorage
 * 
 * Características:
 * - Cache local de 5 minutos para reducir llamadas a Supabase
 * - Fallback a cache si Supabase no está disponible
 * - Retorna false por defecto si el flag no existe
 * 
 * @param flagKey - Clave única del feature flag
 * @returns { isEnabled, config, isLoading, error }
 */
export function useFeatureFlag(flagKey: string) {
  const [isEnabled, setIsEnabled] = useState<boolean>(false);
  const [config, setConfig] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchFeatureFlag() {
      try {
        setIsLoading(true);
        setError(null);

        const cacheKey = `${CACHE_KEY_PREFIX}${flagKey}`;
        
        // 1. Intentar obtener de cache
        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData) {
          try {
            const parsed: FeatureFlagResponse = JSON.parse(cachedData);
            const cacheAge = Date.now() - (parsed.cache_timestamp * 1000);
            
            if (cacheAge < CACHE_DURATION_MS) {
              // Cache válido
              if (isMounted) {
                setIsEnabled(parsed.is_enabled);
                setConfig(parsed.config);
                setIsLoading(false);
              }
              return;
            }
          } catch (e) {
            console.warn('Failed to parse cached feature flag:', e);
          }
        }

        // 2. Fetch de Supabase
        const { data, error: rpcError } = await supabase
          .rpc('get_feature_flag', { p_flag_key: flagKey });

        if (rpcError) throw rpcError;

        // Parse response con validación
        const response = data as unknown as FeatureFlagResponse;
        
        if (!response || typeof response !== 'object') {
          throw new Error('Invalid response from get_feature_flag');
        }

        // 3. Guardar en cache
        try {
          localStorage.setItem(cacheKey, JSON.stringify(response));
        } catch (e) {
          console.warn('Failed to cache feature flag:', e);
        }

        // 4. Actualizar estado
        if (isMounted) {
          setIsEnabled(response.is_enabled);
          setConfig(response.config);
        }

      } catch (err) {
        console.error(`Error fetching feature flag "${flagKey}":`, err);
        
        // Fallback: intentar usar cache aunque esté expirado
        const cacheKey = `${CACHE_KEY_PREFIX}${flagKey}`;
        const cachedData = localStorage.getItem(cacheKey);
        
        if (cachedData) {
          try {
            const parsed: FeatureFlagResponse = JSON.parse(cachedData);
            console.warn(`Using expired cache for feature flag "${flagKey}"`);
            if (isMounted) {
              setIsEnabled(parsed.is_enabled);
              setConfig(parsed.config);
            }
          } catch (e) {
            // Si todo falla, mantener estado por defecto (disabled)
            if (isMounted) {
              setError(err as Error);
            }
          }
        } else {
          if (isMounted) {
            setError(err as Error);
          }
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchFeatureFlag();

    return () => {
      isMounted = false;
    };
  }, [flagKey]);

  return {
    isEnabled,
    config,
    isLoading,
    error,
  };
}

/**
 * Función auxiliar para limpiar cache de feature flags
 * Útil para testing o forzar refresh
 */
export function clearFeatureFlagCache(flagKey?: string) {
  if (flagKey) {
    localStorage.removeItem(`${CACHE_KEY_PREFIX}${flagKey}`);
  } else {
    // Limpiar todos los feature flags
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  }
}
