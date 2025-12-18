import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Image } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';

interface ProductVariant {
  sku: string;
  variante: string | null;
  disponibles: number;
  comprometido: number;
  hasImage?: boolean;
  loadingImage?: boolean;
}

export default function ProductDetail() {
  const { productName } = useParams<{ productName: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [productId, setProductId] = useState<number | null>(null);
  const [variantImages, setVariantImages] = useState<Record<string, string>>({});
  const decodedProductName = productName ? decodeURIComponent(productName) : '';
  const isMobile = useIsMobile();

  useEffect(() => {
    async function fetchProductVariants() {
      if (!decodedProductName) return;

      try {
        // Get product ID from productosBsale table
        const { data: productData, error: productError } = await supabase
          .from('productosBsale')
          .select('id')
          .eq('nombreProducto', decodedProductName)
          .single();

        if (productData && !productError) {
          setProductId(Number(productData.id));
        }

        // Get all SKUs for this variant
        const { data: variantData, error: variantError } = await supabase
          .from('variants')
          .select('sku, variante')
          .eq('nombreProducto', decodedProductName);

        if (variantError) {
          console.error('Error fetching product variants:', variantError);
          return;
        }

        // Get stock information for each SKU
        const variantsWithStock = await Promise.all(
          (variantData || []).map(async (variant) => {
            const { data: stockData } = await supabase
              .from('stockxbin')
              .select('disponibles, comprometido')
              .eq('sku', variant.sku);

            const totalDisponibles = stockData?.reduce((sum, stock) => sum + (stock.disponibles || 0), 0) || 0;
            const totalComprometido = stockData?.reduce((sum, stock) => sum + (stock.comprometido || 0), 0) || 0;

            return {
              sku: variant.sku,
              variante: variant.variante,
              disponibles: totalDisponibles,
              comprometido: totalComprometido
            };
          })
        );

        setVariants(variantsWithStock);
      } catch (error) {
        console.error('Error fetching product variants:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchProductVariants();
  }, [decodedProductName]);


  useEffect(() => {
    async function fetchAllImages() {
      if (variants.length === 0 || !productId) return;
      
      const skus = variants.map(v => v.sku);
      
      // 1. Buscar imágenes específicas de variante
      const { data: variantSpecificImages } = await supabase
        .from('shopify_product_images')
        .select('variant_sku, src')
        .in('variant_sku', skus)
        .order('position', { ascending: true });
      
      // 2. Buscar imagen general del producto (fallback)
      const { data: generalImages } = await supabase
        .from('shopify_product_images')
        .select('src')
        .eq('product_id', productId)
        .eq('is_general_image', true)
        .order('position', { ascending: true })
        .limit(1);
      
      const generalImageSrc = generalImages?.[0]?.src || null;
      
      // 3. Construir mapa de imágenes con fallback
      const imageMap: Record<string, string> = {};
      
      // Primero, aplicar imágenes específicas de variante
      variantSpecificImages?.forEach(img => {
        if (img.variant_sku && !imageMap[img.variant_sku]) {
          imageMap[img.variant_sku] = img.src;
        }
      });
      
      // Luego, para variantes sin imagen específica, usar la general
      skus.forEach(sku => {
        if (!imageMap[sku] && generalImageSrc) {
          imageMap[sku] = generalImageSrc;
        }
      });
      
      setVariantImages(imageMap);
      
      setVariants(prev => prev.map(v => ({
        ...v,
        hasImage: !!imageMap[v.sku],
        loadingImage: false
      })));
    }
    
    fetchAllImages();
  }, [variants.length, productId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate('/products')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Detalle del Producto</h2>
            <p className="text-muted-foreground">Cargando...</p>
          </div>
        </div>
        <Card className="p-6 bg-card border-border">
          <div className="text-center text-muted-foreground">Cargando variantes...</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3 sm:gap-4 px-1">
        <Button
          variant="outline"
          size="icon"
          onClick={() => navigate('/products')}
          className="h-9 w-9 sm:h-10 sm:w-10"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 mb-1 sm:mb-2">
            <h2 className="text-base sm:text-xl font-semibold text-foreground truncate">{decodedProductName}</h2>
            {productId && (
              <span className="text-xs text-muted-foreground shrink-0">ID: {productId}</span>
            )}
          </div>
          <p className="text-xs sm:text-base text-muted-foreground">Variantes y stock detallado</p>
        </div>
      </div>

      <Card className="p-3 sm:p-6 bg-card border-border">
        {/* Desktop Table View */}
        {!isMobile ? (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full">
              <thead>
                <tr className="bg-table-header">
                  <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Variante</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">SKU</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Disponibles</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-muted-foreground">Imagen</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((variant, index) => (
                  <tr 
                    key={variant.sku}
                    className={`${index % 2 === 0 ? 'bg-table-row' : 'bg-table-header'} hover:bg-table-hover transition-colors`}
                  >
                    <td 
                      className="px-6 py-4 text-sm text-foreground font-medium cursor-pointer"
                      onClick={() => navigate(`/productos/ubicaciones?sku=${encodeURIComponent(variant.sku)}`)}
                    >
                      {variant.variante || 'Sin variante'}
                    </td>
                    <td 
                      className="px-6 py-4 text-sm text-muted-foreground cursor-pointer"
                      onClick={() => navigate(`/productos/ubicaciones?sku=${encodeURIComponent(variant.sku)}`)}
                    >
                      {variant.sku}
                    </td>
                    <td 
                      className="px-6 py-4 text-sm text-muted-foreground cursor-pointer"
                      onClick={() => navigate(`/productos/ubicaciones?sku=${encodeURIComponent(variant.sku)}`)}
                    >
                      {variant.disponibles}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {variant.loadingImage ? (
                        <div className="w-10 h-10 bg-muted animate-pulse rounded mx-auto" />
                      ) : variantImages[variant.sku] ? (
                        <img
                          src={variantImages[variant.sku]}
                          alt={variant.variante || 'Producto'}
                          className="w-10 h-10 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity mx-auto"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(variantImages[variant.sku], '_blank');
                          }}
                        />
                      ) : (
                        <div className="w-10 h-10 bg-muted rounded flex items-center justify-center mx-auto">
                          <Image className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {variants.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No se encontraron variantes para este producto
              </div>
            )}
          </div>
        ) : (
          /* Mobile Card View */
          <div className="space-y-2.5">
            {variants.length > 0 ? (
              variants.map((variant) => (
                <Card 
                  key={variant.sku}
                  className="p-3 hover:bg-accent/50 transition-colors active:bg-accent"
                >
                  <div className="space-y-3">
                    <div 
                      className="flex items-start justify-between gap-2 cursor-pointer"
                      onClick={() => navigate(`/productos/ubicaciones?sku=${encodeURIComponent(variant.sku)}`)}
                    >
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-foreground text-base leading-tight">
                          {variant.variante || 'Sin variante'}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          SKU: {variant.sku}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xl font-bold text-foreground">
                          {variant.disponibles}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Disponibles
                        </div>
                      </div>
                    </div>
                    {variant.loadingImage ? (
                      <div className="w-12 h-12 bg-muted animate-pulse rounded" />
                    ) : variantImages[variant.sku] ? (
                      <img
                        src={variantImages[variant.sku]}
                        alt={variant.variante || 'Producto'}
                        className="w-12 h-12 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(variantImages[variant.sku], '_blank');
                        }}
                      />
                    ) : (
                      <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                        <Image className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                </Card>
              ))
            ) : (
              <div className="text-center py-12 text-sm text-muted-foreground">
                No se encontraron variantes
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}