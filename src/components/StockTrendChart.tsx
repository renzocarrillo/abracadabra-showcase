import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface StockData {
  date: string;
  stock: number;
  formatted_date: string;
}

export default function StockTrendChart() {
  const [stockData, setStockData] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalStock, setTotalStock] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    async function fetchStockData() {
      try {
        // Fetch last 30 days of stock data
        const { data: snapshots, error } = await supabase
          .from('daily_stock_snapshots')
          .select('snapshot_date, total_stock')
          .order('snapshot_date', { ascending: false })
          .limit(30);

        if (error) {
          console.error('Error fetching stock data:', error);
          return;
        }

        if (snapshots && snapshots.length > 0) {
          const ordered = snapshots.slice().reverse();
          const formattedData = ordered.map(snapshot => ({
            date: snapshot.snapshot_date,
            stock: snapshot.total_stock,
            formatted_date: format(new Date(snapshot.snapshot_date), 'dd/MM')
          }));

          setStockData(formattedData);
          setTotalStock(formattedData[formattedData.length - 1]?.stock || 0);
        }
      } catch (error) {
        console.error('Error fetching stock data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStockData();
  }, []);

  const handleGenerateSnapshot = async () => {
    setIsGenerating(true);
    try {
      const { error } = await supabase.functions.invoke('daily-stock-snapshot', {
        body: { trigger: 'manual' }
      });

      if (error) throw error;

      toast.success('Snapshot generado correctamente');
      
      // Refresh data after generating snapshot
      const { data: snapshots } = await supabase
        .from('daily_stock_snapshots')
        .select('snapshot_date, total_stock')
        .order('snapshot_date', { ascending: false })
        .limit(30);

      if (snapshots && snapshots.length > 0) {
        const ordered = snapshots.slice().reverse();
        const formattedData = ordered.map(snapshot => ({
          date: snapshot.snapshot_date,
          stock: snapshot.total_stock,
          formatted_date: format(new Date(snapshot.snapshot_date), 'dd/MM')
        }));

        setStockData(formattedData);
        setTotalStock(formattedData[formattedData.length - 1]?.stock || 0);
      }
    } catch (error) {
      console.error('Error generating snapshot:', error);
      toast.error('Error al generar snapshot');
    } finally {
      setIsGenerating(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6 bg-card border-border">
        <h3 className="text-lg font-semibold text-foreground mb-4">Tendencia de Stock Total</h3>
        <div className="h-64 flex items-center justify-center text-muted-foreground">
          Cargando datos de stock...
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-card border-border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Tendencia de Stock Total</h3>
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateSnapshot}
            disabled={isGenerating}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">{totalStock.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">Total actual</div>
          </div>
        </div>
      </div>
      
      {stockData.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={stockData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis 
              dataKey="formatted_date"
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={{ stroke: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis 
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={{ stroke: 'hsl(var(--muted-foreground))' }}
              tickFormatter={(value) => value.toLocaleString()}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length > 0) {
                  return (
                    <div className="bg-popover border border-border rounded-lg p-3 shadow-md">
                      <p className="text-sm font-medium text-popover-foreground">
                        {`Fecha: ${label}`}
                      </p>
                      <p className="text-sm text-primary">
                        {`Stock: ${payload[0].value?.toLocaleString()} unidades`}
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Line
              type="natural"
              dataKey="stock"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={false}
              activeDot={{ 
                r: 6, 
                fill: 'hsl(var(--primary))', 
                stroke: 'hsl(var(--background))', 
                strokeWidth: 2,
                className: "animate-scale-in"
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-64 flex items-center justify-center text-muted-foreground">
          No hay datos de stock disponibles
        </div>
      )}
    </Card>
  );
}