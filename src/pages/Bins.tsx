import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
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
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Edit2, Plus, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BinData {
  bin_code: string;
  product_count: number;
}

type SortField = 'bin_code' | 'product_count';
type SortDirection = 'asc' | 'desc';

const ITEMS_PER_PAGE = 20;

const Bins = () => {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [newBinName, setNewBinName] = useState("");
  const [editingBin, setEditingBin] = useState<string | null>(null);
  const [editBinName, setEditBinName] = useState("");
  const [sortField, setSortField] = useState<SortField>('bin_code');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { hasPermission, isAdmin } = usePermissions();

  // Check permissions
  const canCreate = hasPermission('create_bins') || isAdmin();
  const canEdit = hasPermission('edit_bins_own') || hasPermission('manage_bins_all') || isAdmin();

  // Get total count of bins
  const { data: totalCount } = useQuery({
    queryKey: ['bins-total-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('bins')
        .select('*', { count: 'exact', head: true });

      if (error) throw error;
      return count || 0;
    },
  });

  const { data: binsData, isLoading, error } = useQuery({
    queryKey: ['bins-with-products', currentPage, sortField, sortDirection],
    queryFn: async () => {
      // Calculate offset
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      // Get paginated bins with sorting
      const { data: bins, error: binsError } = await supabase
        .from('bins')
        .select('bin_code')
        .order(sortField === 'bin_code' ? 'bin_code' : 'created_at', { 
          ascending: sortDirection === 'asc' 
        })
        .range(from, to);

      if (binsError) throw binsError;

      // Get product counts for paginated bins
      const binCounts = await Promise.all(
        bins.map(async (bin) => {
          const { count, error: countError } = await supabase
            .from('stockxbin')
            .select('*', { count: 'exact', head: true })
            .eq('bin', bin.bin_code)
            .gt('en_existencia', 0);

          if (countError) throw countError;

          return {
            bin_code: bin.bin_code,
            product_count: count || 0
          };
        })
      );

      // Sort by product_count if needed (can't sort in SQL)
      if (sortField === 'product_count') {
        binCounts.sort((a, b) => {
          const result = a.product_count - b.product_count;
          return sortDirection === 'asc' ? result : -result;
        });
      }

      return binCounts;
    },
  });

  const createBinMutation = useMutation({
    mutationFn: async (binName: string) => {
      if (!user) {
        throw new Error("Usuario no autenticado");
      }
      
      const { data, error } = await supabase
        .from('bins')
        .insert([{ 
          bin_code: binName,
          created_by: user.id 
        }]);
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bins-with-products'] });
      queryClient.invalidateQueries({ queryKey: ['bins-total-count'] });
      toast({
        title: "Bin creado",
        description: "El bin se ha creado exitosamente.",
      });
      setNewBinName("");
      setIsCreateDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al crear el bin: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const editBinMutation = useMutation({
    mutationFn: async ({ oldName, newName }: { oldName: string; newName: string }) => {
      // Use the database function to update bin names atomically
      const { error } = await supabase.rpc('update_bin_name', {
        old_bin_code: oldName,
        new_bin_code: newName
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bins-with-products'] });
      toast({
        title: "Bin actualizado",
        description: "El nombre del bin se ha actualizado exitosamente.",
      });
      setEditBinName("");
      setEditingBin(null);
      setIsEditDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al actualizar el bin: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleCreateBin = () => {
    if (!newBinName.trim()) {
      toast({
        title: "Error",
        description: "El nombre del bin no puede estar vacío.",
        variant: "destructive",
      });
      return;
    }
    createBinMutation.mutate(newBinName.trim());
  };

  const handleEditBin = (binCode: string) => {
    setEditingBin(binCode);
    setEditBinName(binCode);
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editBinName.trim()) {
      toast({
        title: "Error",
        description: "El nombre del bin no puede estar vacío.",
        variant: "destructive",
      });
      return;
    }
    if (editingBin) {
      editBinMutation.mutate({ oldName: editingBin, newName: editBinName.trim() });
    }
  };

  const handleSort = (field: SortField) => {
    setCurrentPage(1); // Reset to first page when sorting
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4" />
      : <ArrowDown className="h-4 w-4" />;
  };

  const totalPages = Math.ceil((totalCount || 0) / ITEMS_PER_PAGE);

  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center">Cargando bins...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-destructive">
              Error al cargar los bins: {error.message}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Gestión de Bins</CardTitle>
          {canCreate && (
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Crear Bin
                </Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear Nuevo Bin</DialogTitle>
                <DialogDescription>
                  Ingresa el nombre para el nuevo bin.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="bin-name" className="text-right">
                    Nombre
                  </Label>
                  <Input
                    id="bin-name"
                    value={newBinName}
                    onChange={(e) => setNewBinName(e.target.value)}
                    className="col-span-3"
                    placeholder="Nombre del bin"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleCreateBin();
                      }
                    }}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button 
                  variant="outline" 
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={handleCreateBin}
                  disabled={createBinMutation.isPending}
                >
                  {createBinMutation.isPending ? "Creando..." : "Crear"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          )}
        </CardHeader>
        <CardContent className="p-3 sm:p-6">
          {/* Desktop Table View */}
          <div className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort('bin_code')}
                      className="h-auto p-0 font-medium justify-start"
                    >
                      Nombre del Bin
                      {getSortIcon('bin_code')}
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort('product_count')}
                      className="h-auto p-0 font-medium justify-end"
                    >
                      Cantidad de Productos
                      {getSortIcon('product_count')}
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {binsData?.map((bin) => (
                  <TableRow key={bin.bin_code}>
                    <TableCell className="font-medium">{bin.bin_code}</TableCell>
                    <TableCell className="text-right">{bin.product_count}</TableCell>
                    <TableCell className="text-right">
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditBin(bin.bin_code)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card View */}
          <div className="lg:hidden">
            {/* Mobile Sort Controls */}
            <div className="flex gap-2 mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSort('bin_code')}
                className="flex items-center gap-1"
              >
                Nombre {getSortIcon('bin_code')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSort('product_count')}
                className="flex items-center gap-1"
              >
                Cantidad {getSortIcon('product_count')}
              </Button>
            </div>
            
            <div className="space-y-3">
              {binsData?.map((bin) => (
                <Card key={bin.bin_code} className="p-4 bg-muted/5 border-border">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{bin.bin_code}</span>
                      <span className="text-sm text-muted-foreground">
                        {bin.product_count} producto{bin.product_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditBin(bin.bin_code)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
          
          {(!binsData || binsData.length === 0) && (
            <div className="text-center py-8 text-muted-foreground">
              No hay bins registrados
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 pt-4 border-t mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePreviousPage}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Anterior
              </Button>
              
              <div className="text-sm text-muted-foreground">
                Página {currentPage} de {totalPages}
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
              >
                Siguiente
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Bin</DialogTitle>
            <DialogDescription>
              Modifica el nombre del bin.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-bin-name" className="text-right">
                Nombre
              </Label>
              <Input
                id="edit-bin-name"
                value={editBinName}
                onChange={(e) => setEditBinName(e.target.value)}
                className="col-span-3"
                placeholder="Nombre del bin"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveEdit();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsEditDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleSaveEdit}
              disabled={editBinMutation.isPending}
            >
              {editBinMutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Bins;