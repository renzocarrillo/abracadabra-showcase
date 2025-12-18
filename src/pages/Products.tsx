import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronUp, ChevronDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Product {
  id: string;
  nombreProducto: string;
  variante: string | null;
  sku: string;
}

interface ProductInventory {
  nombreProducto: string;
  totalStock: number;
  variantCount: number;
  skus: string[]; // Add SKUs for search functionality
}

type SortOrder = 'none' | 'asc' | 'desc';

export default function Products() {
  const [products, setProducts] = useState<ProductInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<SortOrder>('none');
  const ITEMS_PER_PAGE = 25;
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchProductsWithInventory() {
      try {
        const pageSize = 1000;

        // 1) Obtener TODAS las variantes con paginación
        let from = 0;
        const variants: any[] = [];
        while (true) {
          const { data, error } = await supabase
            .from('variants')
            .select('sku, "nombreProducto", variante')
            .range(from, from + pageSize - 1);
          if (error) throw error;
          const rows = data || [];
          variants.push(...rows);
          if (rows.length < pageSize) break;
          from += pageSize;
        }

        // 2) Agrupar por nombre de producto y recolectar SKUs
        type GroupedProduct = {
          nombreProducto: string;
          skus: string[];
          variants: Set<string>;
        };

        const groupedProducts = variants.reduce((acc, variant: any) => {
          const productName = variant.nombreProducto;
          if (!acc[productName]) {
            acc[productName] = {
              nombreProducto: productName,
              skus: [] as string[],
              variants: new Set<string>()
            };
          }
          acc[productName].skus.push(variant.sku);
          if (variant.variante) acc[productName].variants.add(variant.variante);
          return acc;
        }, {} as Record<string, GroupedProduct>);

        // 3) Obtener TODOS los totales de stock con paginación
        from = 0;
        const stockTotals: any[] = [];
        while (true) {
          const { data, error } = await supabase
            .from('stock_totals')
            .select('sku, total_en_existencia, total_disponible, total_comprometido')
            .range(from, from + pageSize - 1);
          if (error) throw error;
          const rows = data || [];
          stockTotals.push(...rows);
          if (rows.length < pageSize) break;
          from += pageSize;
        }
        const totalsBySku = new Map(stockTotals.map(st => [st.sku, st]));

        // 4) Construir arreglo final sumando el inventario por producto
        const productsWithInventory = Object.values(groupedProducts).map((productGroup: GroupedProduct) => {
          const totalStock = productGroup.skus.reduce((sum, sku) => {
            const t = totalsBySku.get(sku);
            const enExistencia = t?.total_en_existencia ?? ((t?.total_disponible || 0) + (t?.total_comprometido || 0));
            return sum + enExistencia;
          }, 0);
          return {
            nombreProducto: productGroup.nombreProducto,
            totalStock,
            variantCount: productGroup.variants.size || 1,
            skus: productGroup.skus
          } as ProductInventory;
        });

        setProducts(productsWithInventory);
      } catch (error) {
        console.error('Error fetching variants with inventory:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchProductsWithInventory();
  }, []);

  // Handle sorting
  const handleSortByStock = () => {
    if (sortOrder === 'none' || sortOrder === 'asc') {
      setSortOrder('desc');
    } else {
      setSortOrder('asc');
    }
    setCurrentPage(1); // Reset to first page when sorting
  };

  // Filter and sort products
  let filteredProducts = products.filter(product => {
    const searchTerm = searchQuery.toLowerCase().trim();
    const productName = product.nombreProducto.toLowerCase();
    
    return productName.includes(searchTerm) ||
           product.skus.some(sku => sku.toLowerCase().includes(searchTerm));
  });

  // Apply sorting
  if (sortOrder === 'desc') {
    filteredProducts = filteredProducts.sort((a, b) => b.totalStock - a.totalStock);
  } else if (sortOrder === 'asc') {
    filteredProducts = filteredProducts.sort((a, b) => a.totalStock - b.totalStock);
  }

  // Calculate pagination
  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

  // Reset to first page when search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Productos</h2>
          <p className="text-muted-foreground">Gestión de productos e inventario</p>
        </div>
        <Card className="p-6 bg-card border-border">
          <div className="text-center text-muted-foreground">Cargando...</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="px-1">
        <h2 className="text-lg sm:text-xl font-semibold text-foreground mb-1 sm:mb-2">Productos</h2>
        <p className="text-sm sm:text-base text-muted-foreground">Gestión de productos e inventario</p>
      </div>

      <Card className="p-3 sm:p-6 bg-card border-border">
        {/* Search Bar */}
        <div className="mb-4 sm:mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Buscar productos por nombre o SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-hidden rounded-lg border border-border">
          <table className="w-full">
            <thead>
              <tr className="bg-table-header">
                <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Producto</th>
                <th 
                  className="px-6 py-4 text-left text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none"
                  onClick={handleSortByStock}
                >
                  <div className="flex items-center gap-1">
                    Inventario
                    {sortOrder === 'desc' && <ChevronDown className="h-4 w-4" />}
                    {sortOrder === 'asc' && <ChevronUp className="h-4 w-4" />}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedProducts.map((product, index) => (
                <tr 
                  key={product.nombreProducto}
                  className={`${index % 2 === 0 ? 'bg-table-row' : 'bg-table-header'} hover:bg-table-hover transition-colors cursor-pointer`}
                  onClick={() => navigate(`/products/${encodeURIComponent(product.nombreProducto)}`)}
                >
                  <td className="px-6 py-4 text-sm text-foreground font-medium">
                    {product.nombreProducto}
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {product.totalStock} en existencias para {product.variantCount} variante{product.variantCount !== 1 ? 's' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {filteredProducts.length === 0 && !loading && (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery ? 'No se encontraron productos que coincidan con la búsqueda' : 'No hay productos registrados'}
            </div>
          )}
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden space-y-2.5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs sm:text-sm text-muted-foreground font-medium">
              {filteredProducts.length} productos
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSortByStock}
              className="text-xs h-8 px-2"
            >
              <span className="mr-1">Ordenar</span>
              {sortOrder === 'desc' && <ChevronDown className="h-3.5 w-3.5" />}
              {sortOrder === 'asc' && <ChevronUp className="h-3.5 w-3.5" />}
              {sortOrder === 'none' && <ChevronDown className="h-3.5 w-3.5 opacity-40" />}
            </Button>
          </div>
          
          {paginatedProducts.length > 0 ? (
            paginatedProducts.map((product) => (
              <Card 
                key={product.nombreProducto}
                className="p-3 cursor-pointer hover:bg-accent/50 transition-colors active:bg-accent"
                onClick={() => navigate(`/products/${encodeURIComponent(product.nombreProducto)}`)}
              >
                <div className="space-y-1.5">
                  <h3 className="font-semibold text-foreground text-base leading-tight">
                    {product.nombreProducto}
                  </h3>
                  <div className="flex items-center justify-between pt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {product.variantCount} variante{product.variantCount !== 1 ? 's' : ''}
                    </span>
                    <span className="text-base font-bold text-foreground">
                      {product.totalStock}
                    </span>
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <div className="text-center py-12 text-sm text-muted-foreground">
              {searchQuery ? 'No se encontraron productos' : 'No hay productos registrados'}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex justify-center">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious 
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (currentPage > 1) setCurrentPage(currentPage - 1);
                    }}
                    className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
                  />
                </PaginationItem>
                
                {(() => {
                  const maxVisiblePages = 10;
                  const startPage = Math.max(1, currentPage);
                  const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
                  
                  return Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i).map((page) => (
                    <PaginationItem key={page}>
                      <PaginationLink
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          setCurrentPage(page);
                        }}
                        isActive={currentPage === page}
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  ));
                })()}
                
                <PaginationItem>
                  <PaginationNext 
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                    }}
                    className={currentPage === totalPages ? "pointer-events-none opacity-50" : ""}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </Card>
    </div>
  );
}