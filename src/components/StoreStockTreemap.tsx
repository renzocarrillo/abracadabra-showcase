import { Card } from '@/components/ui/card';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface StoreStockData {
  name: string;
  size: number;
  fill: string;
}

const STORE_COLORS: { [key: string]: string } = {
  'Almacén Central': 'hsl(220, 70%, 50%)',
  'Real y Lima - Huancayo': 'hsl(200, 65%, 55%)',
  'Real y Cuzco - Huancayo': 'hsl(180, 60%, 50%)',
  'Open Plaza': 'hsl(160, 55%, 50%)',
  'Real Plaza - Huancayo': 'hsl(140, 60%, 50%)',
  'Tarpuy 1': 'hsl(280, 55%, 55%)',
  'Zapatón': 'hsl(260, 60%, 55%)',
  'Guizado': 'hsl(320, 50%, 55%)',
  'Almhyo': 'hsl(340, 55%, 55%)',
  'Tarpuy 2': 'hsl(20, 65%, 55%)',
  'Ancash': 'hsl(40, 70%, 55%)',
};

const STORE_LABELS: { [key: string]: string } = {
  almCentral: 'Almacén Central',
  rLima: 'Real y Lima - Huancayo',
  rCuzco: 'Real y Cuzco - Huancayo',
  open: 'Open Plaza',
  rPlaza: 'Real Plaza - Huancayo',
  tarpuy1: 'Tarpuy 1',
  zapaton: 'Zapatón',
  guizado: 'Guizado',
  almhyo: 'Almhyo',
  tarpuy2: 'Tarpuy 2',
  ancash: 'Ancash',
};

export default function StoreStockTreemap() {
  const [data, setData] = useState<StoreStockData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchStoreStock = async () => {
    try {
      const { data: stockData, error } = await supabase
        .from('stocks_tiendas_bsale')
        .select('almCentral, rLima, rCuzco, open, rPlaza, tarpuy1, zapaton, guizado, almhyo, tarpuy2, ancash');

      if (error) {
        console.error('Error fetching store stock:', error);
        return;
      }

      if (!stockData || stockData.length === 0) {
        setData([]);
        return;
      }

      // Sumar cantidades por tienda
      const storeTotals: { [key: string]: number } = {
        almCentral: 0,
        rLima: 0,
        rCuzco: 0,
        open: 0,
        rPlaza: 0,
        tarpuy1: 0,
        zapaton: 0,
        guizado: 0,
        almhyo: 0,
        tarpuy2: 0,
        ancash: 0,
      };

      stockData.forEach((row) => {
        Object.keys(storeTotals).forEach((store) => {
          const value = row[store as keyof typeof row];
          storeTotals[store] += typeof value === 'number' ? value : 0;
        });
      });

      // Convertir a formato para treemap, filtrar tiendas sin stock
      const treemapData: StoreStockData[] = Object.entries(storeTotals)
        .filter(([_, total]) => total > 0)
        .map(([store, total]) => ({
          name: STORE_LABELS[store] || store,
          size: total,
          fill: STORE_COLORS[STORE_LABELS[store]] || 'hsl(var(--muted))',
        }))
        .sort((a, b) => b.size - a.size);

      setData(treemapData);
    } catch (error) {
      console.error('Error processing store stock:', error);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchStoreStock();
  };

  useEffect(() => {
    fetchStoreStock();

    // Actualizar cada hora (3600000 ms)
    const interval = setInterval(() => {
      fetchStoreStock();
    }, 3600000);

    return () => clearInterval(interval);
  }, []);

  const CustomizedContent = (props: any) => {
    const { x, y, width, height, depth, name, fill } = props;
    
    // Acceder al tamaño desde el payload correcto
    const size = props.size || props.value || 0;
    
    // Solo mostrar si el área es suficientemente grande y tiene datos válidos
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
              productos
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
            {data.size.toLocaleString()} productos
          </p>
        </Card>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <Card className="p-6 bg-card border-border">
        <h3 className="text-lg font-semibold text-foreground mb-4">Stock por Sucursal</h3>
        <div className="h-[400px] flex items-center justify-center text-muted-foreground">
          Cargando datos...
        </div>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="p-6 bg-card border-border">
        <h3 className="text-lg font-semibold text-foreground mb-4">Stock por Sucursal</h3>
        <div className="h-[400px] flex items-center justify-center text-muted-foreground">
          No hay datos disponibles
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-card border-border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Stock por Sucursal</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>
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
