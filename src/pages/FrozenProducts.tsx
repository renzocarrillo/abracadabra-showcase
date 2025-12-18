import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Snowflake, Sun, Search, ArrowLeft, Loader2, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useOptimizedSearch } from '@/hooks/useOptimizedSearch';

interface FrozenProduct {
  id: string;
  sku: string;
  nombre_producto: string;
  fecha_congelacion: string;
  congelado_por_usuario_nombre: string;
  motivo: string;
}

interface Product {
  sku: string;
  nombreProducto: string;
  variante: string | null;
  totalDisponibles: number;
}

export default function FrozenProducts() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const { hasPermission, isAdmin, permissions, userType, loading: permsLoading } = usePermissions();
  const [frozenProducts, setFrozenProducts] = useState<FrozenProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [freezeDialogOpen, setFreezeDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Hook optimizado para búsqueda de productos
  const {
    searchQuery: productSearchQuery,
    setSearchQuery: setProductSearchQuery,
    results: searchResults,
    isSearching: isSearchingProducts,
    hasMinChars
  } = useOptimizedSearch({
    minChars: 3,
    includeStock: false,
    limit: 20
  });

  const canManage = hasPermission('manage_frozen_products') || isAdmin();
  const canView = hasPermission('view_frozen_products') || isAdmin();

  // Debugging logs - remove after fixing
  console.log('FrozenProducts Debug:', {
    user: user?.email,
    profile: profile,
    userType: userType,
    hasViewPermission: hasPermission('view_frozen_products'),
    isAdminUser: isAdmin(),
    canView,
    canManage,
    permissions: permissions.map(p => p.name)
  });

  useEffect(() => {
    if (permsLoading) return; // Esperar a que carguen los permisos

    if (!canView) {
      toast({
        title: "Acceso denegado",
        description: "No tienes permisos para ver productos congelados",
        variant: "destructive",
      });
      navigate('/dashboard');
      return;
    }
    fetchData();
  }, [canView, permsLoading, navigate, toast]);

  const fetchData = async () => {
    try {
      // Fetch frozen products
      const { data: frozen, error: frozenError } = await supabase
        .from('productos_congelados')
        .select('*')
        .order('fecha_congelacion', { ascending: false });

      if (frozenError) throw frozenError;

      setFrozenProducts(frozen || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "Error al cargar los datos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFreezeProduct = async () => {
    if (!selectedProduct || !canManage) return;

    try {
      const { error } = await supabase
        .from('productos_congelados')
        .insert({
          sku: selectedProduct.sku,
          nombre_producto: selectedProduct.nombreProducto,
          congelado_por_usuario_id: user?.id,
          congelado_por_usuario_nombre: profile?.full_name || profile?.email || 'Usuario',
          motivo: 'Producto congelado para traslados'
        });

      if (error) throw error;

      toast({
        title: "Producto congelado",
        description: `El producto ${selectedProduct.sku} ha sido congelado para traslados`,
      });

      setFreezeDialogOpen(false);
      setSelectedProduct(null);
      setProductSearchQuery('');
      fetchData();
    } catch (error) {
      console.error('Error freezing product:', error);
      toast({
        title: "Error",
        description: "Error al congelar el producto",
        variant: "destructive",
      });
    }
  };

  const handleUnfreezeProduct = async (productId: string, sku: string) => {
    if (!canManage) return;

    try {
      const { error } = await supabase
        .from('productos_congelados')
        .delete()
        .eq('id', productId);

      if (error) throw error;

      toast({
        title: "Producto liberado",
        description: `El producto ${sku} ha sido liberado para traslados`,
      });

      fetchData();
    } catch (error) {
      console.error('Error unfreezing product:', error);
      toast({
        title: "Error",
        description: "Error al liberar el producto",
        variant: "destructive",
      });
    }
  };

  const filteredFrozenProducts = frozenProducts.filter(product =>
    product.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.nombre_producto.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (permsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Validando permisos...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando productos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Gestión de Productos Congelados</h1>
          <p className="text-muted-foreground">
            Controla qué productos pueden ser transferidos entre sucursales
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Buscar productos por SKU o nombre..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        {canManage && (
          <Dialog open={freezeDialogOpen} onOpenChange={setFreezeDialogOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2">
                <Snowflake className="h-4 w-4" />
                Congelar Producto
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Congelar Producto</DialogTitle>
                <DialogDescription>
                  Busca y selecciona un producto para congelar sus traslados entre sucursales
                </DialogDescription>
              </DialogHeader>
              
              <div className="mb-4">
                <div className="relative">
                  <Input
                    placeholder={hasMinChars ? "Buscar productos..." : "Escribe al menos 3 caracteres..."}
                    value={productSearchQuery}
                    onChange={(e) => setProductSearchQuery(e.target.value)}
                    className="pr-10"
                  />
                  {isSearchingProducts && (
                    <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                
                {!hasMinChars && productSearchQuery.length > 0 && (
                  <div className="mt-2 p-3 bg-muted rounded-md">
                    <div className="text-sm text-muted-foreground">
                      Escribe al menos 3 caracteres para buscar
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {hasMinChars && searchResults.length === 0 && !isSearchingProducts ? (
                  <div className="py-8 text-center text-muted-foreground">
                    No se encontraron productos
                  </div>
                ) : hasMinChars ? (
                  searchResults.map((product) => (
                    <div
                      key={product.sku}
                      className={`flex items-center justify-between p-3 border rounded-lg hover:bg-accent cursor-pointer ${
                        selectedProduct?.sku === product.sku ? 'bg-accent' : ''
                      }`}
                      onClick={() => setSelectedProduct(product)}
                    >
                      <div className="flex-1">
                        <div className="font-medium">{product.nombreProducto}</div>
                        <div className="text-sm text-muted-foreground">
                          SKU: {product.sku}
                          {product.variante && ` - ${product.variante}`}
                        </div>
                      </div>
                      {selectedProduct?.sku === product.sku && (
                        <Badge variant="default">Seleccionado</Badge>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Escribe al menos 3 caracteres para buscar productos</p>
                  </div>
                )}
              </div>
              
              <DialogFooter>
                <Button
                  onClick={handleFreezeProduct}
                  disabled={!selectedProduct}
                  className="flex items-center gap-2"
                >
                  <Snowflake className="h-4 w-4" />
                  Congelar Producto
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="max-w-4xl">
        {/* Productos Congelados */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Snowflake className="h-5 w-5 text-blue-500" />
              Productos Congelados ({filteredFrozenProducts.length})
            </CardTitle>
            <CardDescription>
              Productos que no pueden ser transferidos entre sucursales
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {filteredFrozenProducts.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No hay productos congelados
                </p>
              ) : (
                filteredFrozenProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between p-3 border rounded-lg bg-blue-50/50"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">{product.sku}</Badge>
                        <span className="font-medium text-sm">{product.nombre_producto}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-1">
                        Congelado por: {product.congelado_por_usuario_nombre}
                      </p>
                      <p className="text-xs text-muted-foreground mb-1">
                        Fecha: {new Date(product.fecha_congelacion).toLocaleDateString()}
                      </p>
                      {product.motivo && (
                        <p className="text-xs bg-muted p-2 rounded mt-2">
                          {product.motivo}
                        </p>
                      )}
                    </div>
                    {canManage && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnfreezeProduct(product.id, product.sku)}
                        className="ml-2 flex items-center gap-1"
                      >
                        <Sun className="h-3 w-3" />
                        Liberar
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}