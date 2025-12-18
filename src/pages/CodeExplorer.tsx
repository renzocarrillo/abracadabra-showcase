import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, MapPin, Package, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface UbicacionTemporal {
  id: number;
  sku: string;
  ubicacion: string;
}

export default function CodeExplorer() {
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const { data: results, isLoading, error } = useQuery({
    queryKey: ['ubicaciones-temporales', searchTerm],
    queryFn: async () => {
      if (!searchTerm.trim()) return { exact: [], similar: [] };

      const normalizedSearch = searchTerm.trim().toUpperCase();

      // Buscar coincidencias exactas
      const { data: exactMatches, error: exactError } = await supabase
        .from('ubicaciones_temporales')
        .select('*')
        .ilike('sku', normalizedSearch);

      if (exactError) throw exactError;

      // Si hay coincidencias exactas, retornar solo esas
      if (exactMatches && exactMatches.length > 0) {
        return { exact: exactMatches as UbicacionTemporal[], similar: [] };
      }

      // Si no hay coincidencias exactas, buscar SKUs que CONTENGAN lo buscado
      // Es decir, el SKU de la BD es más largo que lo buscado
      const { data: similarMatches, error: similarError } = await supabase
        .from('ubicaciones_temporales')
        .select('*')
        .ilike('sku', `%${normalizedSearch}%`);

      if (similarError) throw similarError;

      // Filtrar: solo mostrar SKUs que son "extensiones" de lo buscado
      // Por ejemplo: buscar "1061666" debe mostrar "10616666" pero no "1061665"
      const filtered = (similarMatches || []).filter((item: UbicacionTemporal) => {
        const itemSku = item.sku?.toUpperCase() || '';
        // El SKU debe comenzar con lo buscado (es una extensión)
        return itemSku.startsWith(normalizedSearch);
      });

      return { exact: [], similar: filtered as UbicacionTemporal[] };
    },
    enabled: searchTerm.length > 0,
  });

  const handleSearch = () => {
    setSearchTerm(searchInput);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const allResults = [...(results?.exact || []), ...(results?.similar || [])];
  const hasExactMatch = (results?.exact?.length || 0) > 0;
  const hasSimilarMatch = (results?.similar?.length || 0) > 0;

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-4xl">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Explorador de Códigos
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Busca la ubicación de un código SKU en la tabla de ubicaciones temporales
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Ingresa el SKU a buscar..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={!searchInput.trim()}>
              <Search className="h-4 w-4 mr-2" />
              Buscar
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Buscando...
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-8 text-center text-destructive flex items-center justify-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Error al buscar: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      {searchTerm && !isLoading && !error && (
        <>
          {allResults.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  No se encontraron ubicaciones para "{searchTerm}"
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Resultados</CardTitle>
                  <Badge variant={hasExactMatch ? "default" : "secondary"}>
                    {hasExactMatch ? "Coincidencia exacta" : "Coincidencias similares"}
                  </Badge>
                </div>
                {hasSimilarMatch && (
                  <p className="text-sm text-muted-foreground">
                    No se encontró "{searchTerm}" exacto. Mostrando SKUs que comienzan con ese código.
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Ubicación</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allResults.map((item) => (
                      <TableRow key={`${item.id}-${item.sku}-${item.ubicacion}`}>
                        <TableCell className="font-mono font-medium">
                          {item.sku}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            {item.ubicacion}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!searchTerm && (
        <Card>
          <CardContent className="py-12 text-center">
            <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              Ingresa un código SKU para buscar su ubicación temporal
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
