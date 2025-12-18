import { Card } from '@/components/ui/card';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';

interface ProductTypeData {
  name: string;
  size: number;
  fill: string;
}

const PRODUCT_TYPE_COLORS: { [key: string]: string } = {
  'Polera': 'hsl(200, 60%, 55%)',
  'Polo': 'hsl(180, 55%, 52%)',
  'Short': 'hsl(160, 50%, 50%)',
  'Pantalón': 'hsl(140, 55%, 48%)',
  'Casaca': 'hsl(280, 50%, 55%)',
  'Buzo': 'hsl(260, 55%, 53%)',
  'Polera manga larga': 'hsl(240, 50%, 58%)',
  'Conjunto': 'hsl(320, 45%, 55%)',
  'Chompa': 'hsl(340, 50%, 53%)',
  'Vestido': 'hsl(20, 60%, 55%)',
  'Chaleco': 'hsl(40, 55%, 52%)',
  'Falda': 'hsl(300, 45%, 56%)',
  'Enterizo': 'hsl(190, 48%, 54%)',
  'Default': 'hsl(220, 45%, 52%)',
};

export default function ProductTypeTreemap() {
  const [data, setData] = useState<ProductTypeData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProductTypeStock() {
      try {
        // Obtener variants con su tipo de producto y SKU
        const { data: variantsData, error: variantsError } = await supabase
          .from('variants')
          .select('sku, nameProductType');

        if (variantsError) {
          console.error('Error fetching variants:', variantsError);
          return;
        }

        if (!variantsData || variantsData.length === 0) {
          setData([]);
          return;
        }

        // Obtener stock del almacén central
        const { data: stockData, error: stockError } = await supabase
          .from('stocks_tiendas_bsale')
          .select('sku, almCentral');

        if (stockError) {
          console.error('Error fetching stock:', stockError);
          return;
        }

        if (!stockData || stockData.length === 0) {
          setData([]);
          return;
        }

        // Crear un mapa de SKU -> tipo de producto
        const skuToProductType: { [key: string]: string } = {};
        variantsData.forEach((variant) => {
          if (variant.sku && variant.nameProductType) {
            skuToProductType[variant.sku] = variant.nameProductType;
          }
        });

        // Sumar cantidades por tipo de producto
        const productTypeTotals: { [key: string]: number } = {};

        stockData.forEach((stock) => {
          const productType = skuToProductType[stock.sku];
          if (productType && stock.almCentral) {
            const quantity = typeof stock.almCentral === 'number' ? stock.almCentral : 0;
            if (quantity > 0) {
              productTypeTotals[productType] = (productTypeTotals[productType] || 0) + quantity;
            }
          }
        });

        // Convertir a formato para treemap, filtrar tipos sin stock
        const treemapData: ProductTypeData[] = Object.entries(productTypeTotals)
          .filter(([_, total]) => total > 0)
          .map(([productType, total], index) => {
            // Generar un color único basado en el índice si no está predefinido
            let color = PRODUCT_TYPE_COLORS[productType];
            if (!color) {
              // Generar colores automáticamente distribuidos uniformemente
              const hue = (index * 137.5) % 360; // Usar proporción áurea para distribución uniforme
              color = `hsl(${hue}, 55%, 54%)`;
            }
            console.log(`Tipo: ${productType}, Color: ${color}`);
            return {
              name: productType,
              size: total,
              fill: color,
            };
          })
          .sort((a, b) => b.size - a.size);

        console.log('Treemap data:', treemapData);
        setData(treemapData);
      } catch (error) {
        console.error('Error processing product type stock:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchProductTypeStock();
  }, []);

  const CustomizedContent = (props: any) => {
    const { x, y, width, height, depth, name, fill } = props;
    
    const size = props.size || props.value || 0;
    
    const showText = width > 80 && height > 40 && size > 0 && depth === 1;

    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          style={{
            fill: fill,
            stroke: 'hsl(var(--background))',
            strokeWidth: 2,
          }}
        />
        {showText && name && (
          <>
            <text
              x={x + width / 2}
              y={y + height / 2 - 10}
              textAnchor="middle"
              fill="hsl(var(--background))"
              fontSize={14}
              fontWeight="600"
            >
              {name}
            </text>
            <text
              x={x + width / 2}
              y={y + height / 2 + 10}
              textAnchor="middle"
              fill="hsl(var(--background))"
              fontSize={16}
              fontWeight="700"
            >
              {size.toLocaleString()}
            </text>
            <text
              x={x + width / 2}
              y={y + height / 2 + 28}
              textAnchor="middle"
              fill="hsl(var(--background))"
              fontSize={11}
              opacity={0.9}
            >
              unidades
            </text>
          </>
        )}
      </g>
    );
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <Card className="p-3 bg-popover border-border shadow-lg">
          <p className="font-semibold text-sm text-foreground">{data.name}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {data.size.toLocaleString()} unidades
          </p>
        </Card>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <Card className="p-6 bg-card border-border">
        <h3 className="text-lg font-semibold text-foreground mb-4">Composición por Tipo de Producto</h3>
        <div className="h-[400px] flex items-center justify-center text-muted-foreground">
          Cargando datos...
        </div>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="p-6 bg-card border-border">
        <h3 className="text-lg font-semibold text-foreground mb-4">Composición por Tipo de Producto</h3>
        <div className="h-[400px] flex items-center justify-center text-muted-foreground">
          No hay datos disponibles
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-card border-border">
      <h3 className="text-lg font-semibold text-foreground mb-4">Composición por Tipo de Producto</h3>
      <div className="h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={data}
            dataKey="size"
            aspectRatio={4 / 3}
            stroke="hsl(var(--background))"
            content={<CustomizedContent />}
          >
            <Tooltip content={<CustomTooltip />} />
          </Treemap>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
