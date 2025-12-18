import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ChevronLeft, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Pedido {
  id: string;
  tipo: string;
  pedido: string;
  tienda: string;
  cantidad: number;
  fecha_creacion: string;
}

export default function OrderPreparation() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [loading, setLoading] = useState(true);

  const handleBack = () => {
    navigate(-1);
  };

  useEffect(() => {
    async function fetchPedido() {
      if (!orderId) return;
      
      // Decodificar el ID del pedido para manejar caracteres especiales como #
      const decodedOrderId = decodeURIComponent(orderId);
      
      try {
        // Esta funcionalidad necesita ser reimplementada con la nueva estructura de base de datos
        console.log('Funcionalidad de preparación deshabilitada temporalmente');
        
        // const { data, error } = await (supabase as any)
        //   .from('pedidos2.0')
        //   .select('*')
        //   .eq('pedidoid', decodedOrderId);
        
        // if (error) {
        //   console.error('Error fetching pedido:', error);
        //   return;
        // }
        
        // if (!data || data.length === 0) {
        //   setPedido(null);
        //   return;
        // }
        
        // Agrupar datos del pedido y calcular cantidad total
        // const firstItem = data[0];
        // const totalCantidad = data.reduce((sum: number, item: any) => sum + (item.cantidad || 0), 0);
        
        // const pedidoData: Pedido = {
        //   id: firstItem.id,
        //   tipo: firstItem.tipo || '',
        //   pedido: firstItem.pedidoid,
        //   tienda: firstItem.tienda || '',
        //   cantidad: totalCantidad,
        //   fecha_creacion: firstItem.created_at
        // };
        
        // setPedido(pedidoData);
        
        setPedido(null);
      } catch (error) {
        console.error('Error fetching pedido:', error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchPedido();
  }, [orderId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex">
        <div className="w-64 bg-sidebar border-r border-sidebar-border">
          <div className="p-6">
            <h1 className="text-xl font-bold text-sidebar-foreground">Abracadabra</h1>
          </div>
        </div>
        
        <main className="flex-1">
          <header className="bg-card border-b border-border p-6 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleBack}
                className="p-2"
              >
                <ChevronLeft size={20} />
              </Button>
              <h1 className="text-2xl font-semibold text-foreground">Cargando...</h1>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Tienda</p>
              <p className="font-medium text-foreground">...</p>
            </div>
          </header>
          
          <div className="p-6">
            <div className="text-center text-muted-foreground">Cargando información del pedido...</div>
          </div>
        </main>
      </div>
    );
  }

  if (!pedido) {
    return (
      <div className="min-h-screen bg-background flex">
        <div className="w-64 bg-sidebar border-r border-sidebar-border">
          <div className="p-6">
            <h1 className="text-xl font-bold text-sidebar-foreground">Abracadabra</h1>
          </div>
        </div>
        
        <main className="flex-1">
          <header className="bg-card border-b border-border p-6 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleBack}
                className="p-2"
              >
                <ChevronLeft size={20} />
              </Button>
              <h1 className="text-2xl font-semibold text-foreground">Pedido no encontrado</h1>
            </div>
          </header>
          
          <div className="p-6">
            <div className="text-center text-muted-foreground">No se pudo encontrar el pedido solicitado.</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold text-sidebar-foreground">Abracadabra</h1>
        </div>

        {/* Navegación simplificada para esta vista */}
        <nav className="flex-1 px-4 space-y-2">
          <div className="w-full flex items-center gap-3 px-4 py-2 text-left rounded-md bg-sidebar-accent text-sidebar-accent-foreground">
            <span className="font-medium">Inicio</span>
          </div>
          
          <div className="w-full flex items-center gap-3 px-4 py-2 text-left rounded-md text-sidebar-foreground">
            <span className="font-medium">Productos</span>
          </div>
          <div className="ml-6 space-y-1">
            <div className="w-full text-left px-4 py-1 text-sm rounded-md text-sidebar-foreground">
              Bins
            </div>
            <div className="w-full text-left px-4 py-1 text-sm rounded-md text-sidebar-foreground">
              Inventario
            </div>
          </div>

          <div className="w-full flex items-center gap-3 px-4 py-2 text-left rounded-md text-sidebar-foreground">
            <span className="font-medium">Pedidos</span>
          </div>
          <div className="ml-6 space-y-1">
            <div className="w-full text-left px-4 py-1 text-sm rounded-md text-sidebar-foreground">
              Tiendas físicas
            </div>
            <div className="w-full text-left px-4 py-1 text-sm rounded-md text-sidebar-foreground">
              Página web
            </div>
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1">
        <header className="bg-card border-b border-border p-6 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleBack}
              className="p-2"
            >
              <ChevronLeft size={20} />
            </Button>
            <h1 className="text-2xl font-semibold text-foreground">{pedido.pedido}</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Tienda</p>
              <p className="font-medium text-foreground">{pedido.tienda}</p>
            </div>
            <Button variant="ghost" size="sm">
              <User size={20} />
            </Button>
          </div>
        </header>

        <div className="p-6">
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-foreground mb-2">Preparación del Pedido</h2>
              <p className="text-muted-foreground">Comienza a preparar los artículos de este pedido</p>
            </div>
            
            {/* Aquí irá el contenido de preparación del pedido */}
            <div className="bg-card border border-border rounded-lg p-8 text-center">
              <p className="text-muted-foreground">
                Vista de preparación del pedido <strong>{pedido.pedido}</strong> para la tienda <strong>{pedido.tienda}</strong>
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                {pedido.cantidad} artículos - Tipo: {pedido.tipo}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}