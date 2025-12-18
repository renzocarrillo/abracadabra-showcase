import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOptimizedSearch } from '@/hooks/useOptimizedSearch';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ProductLocationData {
  id: string;
  sku: string;
  bin: string;
  disponibles: number;
  comprometido: number;
  en_existencia: number;
  nombreProducto?: string;
  variante?: string;
}

export default function ProductLocation() {
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const isMobile = useIsMobile();
  
  const {
    searchQuery,
    setSearchQuery,
    results: suggestions,
    isSearching,
    showSuggestions,
    setShowSuggestions,
    selectResult,
    hasMinChars
  } = useOptimizedSearch({
    minChars: 3,
    includeStock: false,
    limit: 10
  });

  // Auto-load SKU from URL parameter
  useEffect(() => {
    const skuFromUrl = searchParams.get('sku');
    if (skuFromUrl && skuFromUrl.trim()) {
      setSearchQuery(skuFromUrl);
      setSearchTerm(skuFromUrl);
    }
  }, [searchParams, setSearchQuery]);

  const { data: productLocations, isLoading, error } = useQuery({
    queryKey: ['product-locations', searchTerm],
    queryFn: async () => {
      if (!searchTerm.trim()) return [];

      const { data: stockData, error: stockError } = await supabase
        .from('stockxbin')
        .select('id, sku, bin, disponibles, comprometido, en_existencia')
        .eq('sku', searchTerm.trim())
        .order('bin');

      if (stockError) throw stockError;

      // Get variant information to show product name and variant
      const { data: variantData } = await supabase
        .from('variants')
        .select('sku, nombreProducto, variante')
        .eq('sku', searchTerm.trim())
        .single();

      // Combine stock data with variant information
      const locationsWithProductInfo: ProductLocationData[] = (stockData || []).map(stock => ({
        ...stock,
        nombreProducto: variantData?.nombreProducto,
        variante: variantData?.variante,
      }));

      return locationsWithProductInfo;
    },
    enabled: !!searchTerm.trim(),
  });

  const handleSearch = () => {
    if (!hasMinChars) {
      return; // No buscar si no hay mínimo de caracteres
    }
    setSearchTerm(searchQuery.trim());
    setShowSuggestions(false);
  };

  const handleSuggestionClick = (suggestion: any) => {
    selectResult(suggestion);
    setSearchTerm(suggestion.sku);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
  };

  const totalAvailable = productLocations?.reduce((sum, location) => sum + (location.disponibles || 0), 0) || 0;
  const totalCommitted = productLocations?.reduce((sum, location) => sum + (location.comprometido || 0), 0) || 0;
  const totalInStock = productLocations?.reduce((sum, location) => sum + (location.en_existencia || 0), 0) || 0;

  return (
    <div className="container mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center space-x-2 px-1">
        <h1 className="text-xl sm:text-3xl font-bold">Ubicación de Productos</h1>
      </div>

      <Card className="p-3 sm:p-6">
        <div className="space-y-3 sm:space-y-4">
          <div>
            <label className="text-xs sm:text-sm font-medium mb-2 block">
              Buscar producto por SKU
            </label>
            <div className="flex gap-2 relative">
              <div className="relative flex-1">
                <Input
                  type="text"
                  placeholder={hasMinChars ? "Buscar por SKU..." : "Escribe al menos 3 caracteres..."}
                  value={searchQuery}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyPress}
                  className="pr-10"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
                
                {/* Suggestions dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-background border border-input rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {suggestions.map((suggestion, index) => (
                      <button
                        key={suggestion.sku}
                        className="w-full text-left px-3 py-2 hover:bg-accent hover:text-accent-foreground border-b last:border-b-0 focus:outline-none focus:bg-accent"
                        onClick={() => handleSuggestionClick(suggestion)}
                      >
                        <div className="font-medium">{suggestion.sku}</div>
                        <div className="text-sm text-muted-foreground">{suggestion.nombreProducto}</div>
                        {suggestion.variante && (
                          <div className="text-xs text-muted-foreground">Variante: {suggestion.variante}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* Show message when not enough characters */}
                {!hasMinChars && searchQuery.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-background border border-input rounded-md shadow-lg p-3">
                    <div className="text-sm text-muted-foreground">
                      Escribe al menos 3 caracteres para buscar
                    </div>
                  </div>
                )}
              </div>
              
              <Button 
                onClick={handleSearch} 
                disabled={!hasMinChars}
                className="flex-shrink-0"
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Results */}
      {searchTerm && (
        <Card className="p-3 sm:p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin" />
              <span className="ml-2 text-sm sm:text-base">Buscando ubicaciones...</span>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500 text-sm sm:text-base">
              Error al buscar las ubicaciones del producto
            </div>
          ) : productLocations && productLocations.length > 0 ? (
            <div className="space-y-3 sm:space-y-4">
              {/* Product Info Header */}
              <div className="border-b pb-3 sm:pb-4">
                <h2 className="text-base sm:text-lg font-semibold leading-tight">{productLocations[0].nombreProducto}</h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">SKU: {searchTerm}</p>
                {productLocations[0].variante && (
                  <p className="text-xs sm:text-sm text-muted-foreground">Variante: {productLocations[0].variante}</p>
                )}
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6">
                <Card className="p-3 sm:p-4 text-center">
                  <div className="text-xl sm:text-2xl font-bold text-green-600">{totalAvailable}</div>
                  <div className="text-xs sm:text-sm text-muted-foreground mt-1">Disponible</div>
                </Card>
                <Card className="p-3 sm:p-4 text-center">
                  <div className="text-xl sm:text-2xl font-bold text-yellow-600">{totalCommitted}</div>
                  <div className="text-xs sm:text-sm text-muted-foreground mt-1">Comprometido</div>
                </Card>
                <Card className="p-3 sm:p-4 text-center">
                  <div className="text-xl sm:text-2xl font-bold text-blue-600">{totalInStock}</div>
                  <div className="text-xs sm:text-sm text-muted-foreground mt-1">En Existencia</div>
                </Card>
              </div>

              {/* Locations - Desktop Table */}
              {!isMobile ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bin</TableHead>
                      <TableHead className="text-right">Disponible</TableHead>
                      <TableHead className="text-right">Comprometido</TableHead>
                      <TableHead className="text-right">En Existencia</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productLocations.map((location) => (
                      <TableRow key={location.id}>
                        <TableCell className="font-medium">{location.bin}</TableCell>
                        <TableCell className="text-right text-green-600">
                          {location.disponibles}
                        </TableCell>
                        <TableCell className="text-right text-yellow-600">
                          {location.comprometido}
                        </TableCell>
                        <TableCell className="text-right text-blue-600">
                          {location.en_existencia}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                /* Locations - Mobile Cards */
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold mb-2 px-1">Ubicaciones por Bin</h3>
                  {productLocations.map((location) => (
                    <Card key={location.id} className="p-3">
                      <div className="space-y-2">
                        <div className="font-bold text-base pb-2 border-b">
                          Bin: {location.bin}
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <div className="text-lg font-bold text-green-600">{location.disponibles}</div>
                            <div className="text-xs text-muted-foreground">Disponible</div>
                          </div>
                          <div>
                            <div className="text-lg font-bold text-yellow-600">{location.comprometido}</div>
                            <div className="text-xs text-muted-foreground">Comprometido</div>
                          </div>
                          <div>
                            <div className="text-lg font-bold text-blue-600">{location.en_existencia}</div>
                            <div className="text-xs text-muted-foreground">En Existencia</div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm sm:text-base">
              No se encontraron ubicaciones para el SKU: {searchTerm}
            </div>
          )}
        </Card>
      )}

      {/* Initial state message */}
      {!searchTerm && (
        <Card className="p-6 sm:p-8 text-center">
          <div className="text-muted-foreground">
            <Search className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 opacity-50" />
            <p className="text-sm sm:text-base">Introduce al menos 3 caracteres para buscar un producto por SKU</p>
          </div>
        </Card>
      )}
    </div>
  );
}