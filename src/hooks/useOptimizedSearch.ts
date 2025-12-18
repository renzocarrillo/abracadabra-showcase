import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SearchResult {
  sku: string;
  nombreProducto: string;
  variante: string | null;
  totalDisponibles: number;
}

interface UseOptimizedSearchOptions {
  minChars?: number;
  debounceMs?: number;
  includeStock?: boolean;
  limit?: number;
}

export function useOptimizedSearch(options: UseOptimizedSearchOptions = {}) {
  const {
    minChars = 3,
    debounceMs = 300,
    includeStock = true,
    limit = 20
  } = options;

  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const performSearch = useCallback(async (query: string) => {
    if (query.trim().length < minChars) {
      setResults([]);
      setShowSuggestions(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      // Búsqueda optimizada usando índices trigram
      let searchBuilder = supabase
        .from('variants')
        .select('sku, "nombreProducto", variante');

      // Buscar en múltiples campos usando el operador OR
      const searchTerm = query.trim();
      
      // Primera estrategia: búsqueda exacta por SKU
      const exactSkuMatch = await supabase
        .from('variants')
        .select('sku, "nombreProducto", variante')
        .eq('sku', searchTerm);

      // Segunda estrategia: búsqueda por similitud usando trigram
      const similaritySearch = await supabase
        .from('variants')
        .select('sku, "nombreProducto", variante')
        .textSearch('nombreProducto', searchTerm)
        .limit(limit);

      // Tercera estrategia: búsqueda por ILIKE en SKU y nombre
      const ilikeSearch = await supabase
        .from('variants')
        .select('sku, "nombreProducto", variante')
        .or(`sku.ilike.%${searchTerm}%,"nombreProducto".ilike.%${searchTerm}%,variante.ilike.%${searchTerm}%`)
        .limit(limit);

      // Combinar resultados priorizando matches exactos
      const combinedResults = new Map<string, any>();
      
      // Agregar matches exactos primero (prioridad alta)
      exactSkuMatch.data?.forEach(item => {
        combinedResults.set(item.sku, { ...item, priority: 1 });
      });

      // Agregar búsqueda de similitud (prioridad media)
      similaritySearch.data?.forEach(item => {
        if (!combinedResults.has(item.sku)) {
          combinedResults.set(item.sku, { ...item, priority: 2 });
        }
      });

      // Agregar búsqueda ILIKE (prioridad baja)
      ilikeSearch.data?.forEach(item => {
        if (!combinedResults.has(item.sku)) {
          combinedResults.set(item.sku, { ...item, priority: 3 });
        }
      });

      let searchResults = Array.from(combinedResults.values())
        .sort((a, b) => a.priority - b.priority)
        .slice(0, limit);

      // Si se incluye stock, obtener totales
      if (includeStock && searchResults.length > 0) {
        const skus = searchResults.map(r => r.sku);
        const { data: stockData, error: stockError } = await supabase
          .from('stock_totals')
          .select('sku, total_disponible')
          .in('sku', skus);

        // Si hay error al obtener stock o no hay datos, mantener productos sin filtrar por stock
        if (stockError || !stockData) {
          console.warn('Error al obtener stock totals:', stockError);
          searchResults = searchResults.map(result => ({
            ...result,
            totalDisponibles: 0 // Mostrar 0 si no hay datos de stock
          }));
        } else {
          const stockMap = new Map(stockData.map(s => [s.sku, s.total_disponible]) || []);
          
          searchResults = searchResults.map(result => ({
            ...result,
            totalDisponibles: stockMap.get(result.sku) || 0
          }));

          // Ordenar por stock (productos con stock primero)
          searchResults = searchResults.sort((a, b) => {
            // Prioridad: productos con stock primero
            if ((a.totalDisponibles || 0) > 0 && (b.totalDisponibles || 0) === 0) return -1;
            if ((a.totalDisponibles || 0) === 0 && (b.totalDisponibles || 0) > 0) return 1;
            // Si ambos tienen o no tienen stock, mantener orden por prioridad de búsqueda
            return (a.priority || 0) - (b.priority || 0);
          });
        }
      }

      setResults(searchResults);
      setShowSuggestions(searchResults.length > 0);

    } catch (error) {
      console.error('Error in optimized search:', error);
      setResults([]);
      setShowSuggestions(false);
    } finally {
      setIsSearching(false);
    }
  }, [minChars, includeStock, limit]);

  // Debounce search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      performSearch(searchQuery);
    }, debounceMs);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, performSearch, debounceMs]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setResults([]);
    setShowSuggestions(false);
    setIsSearching(false);
  }, []);

  const selectResult = useCallback((result: SearchResult) => {
    setSearchQuery(result.sku);
    setShowSuggestions(false);
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    results,
    isSearching,
    showSuggestions,
    setShowSuggestions,
    clearSearch,
    selectResult,
    hasMinChars: searchQuery.trim().length >= minChars
  };
}