import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowRightLeft, Package, Search, ChevronLeft, ChevronRight, Save, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BinStock {
  id: string;
  sku: string;
  disponibles: number;
  comprometido: number;
  en_existencia: number;
  nombreProducto?: string;
  variante?: string;
}

interface MoveItem {
  stockId: string;
  sku: string;
  cantidad: number;
}

const MoveProducts = () => {
  const [sourceBin, setSourceBin] = useState<string>("");
  const [destinationBin, setDestinationBin] = useState<string>("");
  const [moveItems, setMoveItems] = useState<{ [key: string]: number }>({});
  const [searchSku, setSearchSku] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<() => void | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const ITEMS_PER_PAGE = 25;

  // Get all bins
  const { data: bins, isLoading: binsLoading } = useQuery({
    queryKey: ['bins'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bins')
        .select('bin_code')
        .order('bin_code');
      
      if (error) throw error;
      return data;
    },
  });

  // Get stock for source bin with pagination and search
  const { data: sourceStockData, isLoading: sourceStockLoading } = useQuery({
    queryKey: ['source-bin-stock', sourceBin, currentPage, searchSku],
    queryFn: async () => {
      if (!sourceBin) return { data: [], totalCount: 0 };
      
      // Build query with pagination and search
      let query = supabase
        .from('stockxbin')
        .select(`
          id,
          sku,
          disponibles,
          comprometido,
          en_existencia
        `, { count: 'exact' })
        .eq('bin', sourceBin)
        .gt('disponibles', 0);

      // Add search filter if provided
      if (searchSku) {
        query = query.ilike('sku', `%${searchSku}%`);
      }

      // Add pagination
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      query = query.range(from, to);

      const { data: stockxbin, error: stockError, count } = await query;

      if (stockError) throw stockError;

      // Get product names for the SKUs
      const skus = stockxbin.map(item => item.sku);
      if (skus.length === 0) return { data: [], totalCount: count || 0 };

      const { data: variants, error: variantsError } = await supabase
        .from('variants')
        .select('sku, nombreProducto, variante')
        .in('sku', skus);

      if (variantsError) throw variantsError;

      // Combine stock data with variant information
      const enrichedData = stockxbin.map(stock => {
        const variant = variants.find(p => p.sku === stock.sku);
        return {
          ...stock,
          nombreProducto: variant?.nombreProducto || 'Producto desconocido',
          variante: variant?.variante || '',
        };
      });

      return { 
        data: enrichedData as BinStock[], 
        totalCount: count || 0 
      };
    },
    enabled: !!sourceBin,
  });

  // Move products mutation using safe database function
  const moveProductsMutation = useMutation({
    mutationFn: async () => {
      if (!sourceBin || !destinationBin) {
        throw new Error("Debe seleccionar bin de origen y destino");
      }

      const movesToExecute = Object.entries(moveItems).filter(([_, cantidad]) => cantidad > 0);
      
      if (movesToExecute.length === 0) {
        throw new Error("Debe seleccionar al menos un producto para mover");
      }

      const results = {
        successful: [] as string[],
        failed: [] as { id: string; error: string }[]
      };

      // Execute moves for each product using safe database function
      for (const [stockId, cantidad] of movesToExecute) {
        try {
          const { data, error } = await supabase.rpc('safe_move_product_between_bins', {
            source_stock_id: stockId,
            destination_bin_code: destinationBin,
            move_quantity: cantidad
          });
          
          if (error) {
            console.error('Error moving product:', stockId, error);
            results.failed.push({ id: stockId, error: error.message });
          } else if (data) {
            results.successful.push(stockId);
          } else {
            results.failed.push({ id: stockId, error: 'Error desconocido al mover producto' });
          }
          
          // Small delay between moves for safety
          if (movesToExecute.indexOf([stockId, cantidad]) < movesToExecute.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error: any) {
          console.error('Unexpected error moving product:', stockId, error);
          results.failed.push({ id: stockId, error: error.message });
        }
      }

      if (results.failed.length > 0) {
        throw new Error(`Errores en ${results.failed.length} movimientos: ${results.failed[0].error}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['source-bin-stock'] });
      queryClient.invalidateQueries({ queryKey: ['bin-stock'] });
      toast({
        title: "Productos movidos",
        description: "Los productos se han movido exitosamente entre bins.",
      });
      setMoveItems({});
      setHasUnsavedChanges(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al mover productos: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleQuantityChange = (stockId: string, value: string) => {
    const numValue = parseInt(value) || 0;
    setMoveItems(prev => ({
      ...prev,
      [stockId]: numValue
    }));
    setHasUnsavedChanges(true);
  };

  const handleMoveProducts = () => {
    moveProductsMutation.mutate();
  };

  const handleUndoChanges = () => {
    setMoveItems({});
    setHasUnsavedChanges(false);
  };

  const handleSearchChange = (value: string) => {
    setSearchSku(value);
    setCurrentPage(1); // Reset to first page when searching
  };

  const handleSourceBinChange = (value: string) => {
    if (hasUnsavedChanges) {
      setPendingNavigation(() => () => {
        setSourceBin(value);
        setCurrentPage(1);
        setMoveItems({});
        setHasUnsavedChanges(false);
      });
      setShowUnsavedDialog(true);
    } else {
      setSourceBin(value);
      setCurrentPage(1);
    }
  };

  const handleDestinationBinChange = (value: string) => {
    if (hasUnsavedChanges) {
      setPendingNavigation(() => () => {
        setDestinationBin(value);
      });
      setShowUnsavedDialog(true);
    } else {
      setDestinationBin(value);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (hasUnsavedChanges) {
      setPendingNavigation(() => () => {
        setCurrentPage(newPage);
      });
      setShowUnsavedDialog(true);
    } else {
      setCurrentPage(newPage);
    }
  };

  const confirmNavigation = () => {
    if (pendingNavigation) {
      pendingNavigation();
      setPendingNavigation(null);
    }
    setShowUnsavedDialog(false);
  };

  const cancelNavigation = () => {
    setPendingNavigation(null);
    setShowUnsavedDialog(false);
  };

  // Reset page when source bin or search changes
  useEffect(() => {
    if (!hasUnsavedChanges) {
      setCurrentPage(1);
    }
  }, [sourceBin, searchSku, hasUnsavedChanges]);

  const getTotalItemsToMove = () => {
    return Object.values(moveItems).reduce((sum, cantidad) => sum + cantidad, 0);
  };

  const totalPages = Math.ceil((sourceStockData?.totalCount || 0) / ITEMS_PER_PAGE);
  const stockData = sourceStockData?.data || [];

  if (binsLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center">Cargando...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="flex items-center gap-4">
            <ArrowRightLeft className="h-6 w-6" />
            <CardTitle>Mover Productos</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Bin de origen</label>
              <Select value={sourceBin} onValueChange={handleSourceBinChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar bin origen" />
                </SelectTrigger>
                <SelectContent>
                  {bins?.map((bin) => (
                    <SelectItem 
                      key={bin.bin_code} 
                      value={bin.bin_code}
                      disabled={bin.bin_code === destinationBin}
                    >
                      {bin.bin_code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-end justify-center">
              <ArrowRightLeft className="h-6 w-6 text-muted-foreground" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Bin de destino</label>
              <Select value={destinationBin} onValueChange={handleDestinationBinChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar bin destino" />
                </SelectTrigger>
                <SelectContent>
                  {bins?.map((bin) => (
                    <SelectItem 
                      key={bin.bin_code} 
                      value={bin.bin_code}
                      disabled={bin.bin_code === sourceBin}
                    >
                      {bin.bin_code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Search Bar */}
          {sourceBin && (
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por SKU..."
                  value={searchSku}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          )}

          {sourceStockLoading ? (
            <div className="text-center py-8">Cargando productos...</div>
          ) : !sourceBin ? (
            <div className="text-center py-8 text-muted-foreground">
              Selecciona un bin de origen para ver sus productos
            </div>
          ) : !stockData || stockData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay productos disponibles en este bin
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-center">Disponible</TableHead>
                    <TableHead className="text-center">Cantidad a mover</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockData.map((stockItem) => (
                    <TableRow key={stockItem.id}>
                      <TableCell className="font-medium">
                        <div>
                          <div>{stockItem.nombreProducto}</div>
                          {stockItem.variante && (
                            <div className="text-sm text-muted-foreground">
                              {stockItem.variante}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{stockItem.sku}</TableCell>
                      <TableCell className="text-center">
                        <span className="text-muted-foreground">
                          {stockItem.disponibles}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Input
                          type="number"
                          min="0"
                          max={stockItem.disponibles}
                          value={moveItems[stockItem.id] || 0}
                          onChange={(e) => handleQuantityChange(stockItem.id, e.target.value)}
                          className="w-20 text-center"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-6 pt-4 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Página {currentPage} de {totalPages} 
                    ({sourceStockData?.totalCount || 0} productos total)
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                  >
                    Siguiente
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-between items-center mt-6 pt-4 border-t">
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground">
                    Total de productos a mover: {getTotalItemsToMove()}
                  </div>
                  {hasUnsavedChanges && (
                    <div className="text-sm text-amber-600">
                      Cambios sin guardar
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {hasUnsavedChanges && (
                    <Button 
                      variant="outline" 
                      onClick={handleUndoChanges}
                      size="sm"
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Deshacer
                    </Button>
                  )}
                  <Button 
                    onClick={handleMoveProducts}
                    disabled={!destinationBin || getTotalItemsToMove() === 0 || moveProductsMutation.isPending}
                  >
                    <Save className="h-4 w-4 mr-1" />
                    {moveProductsMutation.isPending ? "Guardando..." : "Guardar Cambios"}
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* Unsaved Changes Dialog */}
          <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cambios sin guardar</AlertDialogTitle>
                <AlertDialogDescription>
                  Tienes cambios sin guardar. ¿Qué deseas hacer?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={cancelNavigation}>
                  Cancelar
                </AlertDialogCancel>
                <AlertDialogAction onClick={handleMoveProducts} disabled={moveProductsMutation.isPending}>
                  Guardar y continuar
                </AlertDialogAction>
                <Button 
                  onClick={confirmNavigation}
                  variant="destructive"
                  className="ml-2"
                >
                  Descartar cambios
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
};

export default MoveProducts;