import { NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Home, Package, ShoppingCart, Plus, CreditCard, Settings, LogOut, User, Snowflake, ScanBarcode, Calculator, Tag, FileSpreadsheet, ClipboardList, Scale, ChevronDown, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { ConfigurationSheet } from './ConfigurationSheet';
import { ThemeToggle } from './ThemeToggle';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useNavigate } from 'react-router-dom';

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  path: string;
  children?: { label: string; path: string }[];
  count?: number;
}

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { state } = useSidebar();
  const { profile, signOut } = useAuth();
  const { hasPermission, userType, isAdmin } = usePermissions();
  const [ordersCount, setOrdersCount] = useState<number>(0);
  const [discrepanciesCount, setDiscrepanciesCount] = useState<number>(0);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  // Fetch counters and subscribe to realtime changes
  useEffect(() => {
    fetchOrdersCount();
    fetchDiscrepanciesCount();

    const channel = supabase.channel('sidebar-counts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, fetchOrdersCount)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ventas' }, fetchOrdersCount)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stockxbin' }, fetchDiscrepanciesCount)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stocks_tiendas_bsale' }, fetchDiscrepanciesCount)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchOrdersCount() {
    try {
      // Obtener count de pedidos
      const { count: pedidosCount } = await supabase
        .from('pedidos')
        .select('*', { count: 'exact', head: true })
        .neq('estado', 'archivado');
      
      // Obtener count de ventas
      const { count: ventasCount } = await supabase
        .from('ventas')
        .select('*', { count: 'exact', head: true })
        .neq('estado', 'cancelada')
        .neq('estado', 'archivado');
      
      const totalCount = (pedidosCount || 0) + (ventasCount || 0);
      setOrdersCount(totalCount);
    } catch (error) {
      console.error('Error fetching orders count:', error);
    }
  }

  async function fetchDiscrepanciesCount() {
    try {
      // Helper to normalize SKU
      const normalizeSku = (sku: string): string => {
        return sku.replace(/[–—]/g, '-').trim().toUpperCase();
      };

      // Fetch stockxbin aggregated by SKU
      const { data: abracadabraData } = await supabase
        .from('stockxbin')
        .select('sku, disponibles, comprometido, reservado')
        .not('sku', 'is', null);

      // Fetch stocks_tiendas_bsale
      const { data: bsaleData } = await supabase
        .from('stocks_tiendas_bsale')
        .select('sku, almCentral')
        .not('sku', 'is', null);

      // Aggregate Abracadabra stock by SKU
      const abracadabraMap = new Map<string, number>();
      abracadabraData?.forEach(item => {
        if (item.sku) {
          const normalizedSku = normalizeSku(item.sku);
          const currentTotal = abracadabraMap.get(normalizedSku) || 0;
          const itemTotal = (item.disponibles || 0) + (item.comprometido || 0) + (item.reservado || 0);
          abracadabraMap.set(normalizedSku, currentTotal + itemTotal);
        }
      });

      // Create BSale map
      const bsaleMap = new Map<string, number>();
      bsaleData?.forEach(item => {
        if (item.sku) {
          const normalizedSku = normalizeSku(item.sku);
          bsaleMap.set(normalizedSku, item.almCentral || 0);
        }
      });

      // Get all unique SKUs
      const allSkus = new Set([...abracadabraMap.keys(), ...bsaleMap.keys()]);

      // Count discrepancies
      let discrepancies = 0;
      allSkus.forEach(sku => {
        const abracadabraStock = abracadabraMap.get(sku) || 0;
        const bsaleStock = bsaleMap.get(sku) || 0;
        const difference = abracadabraStock - bsaleStock;
        
        if (difference !== 0) {
          discrepancies++;
        }
      });

      setDiscrepanciesCount(discrepancies);
    } catch (error) {
      console.error('Error fetching discrepancies count:', error);
    }
  }

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  // Define all sidebar items
  const allSidebarItems: SidebarItemProps[] = [
    {
      icon: <Home size={18} />,
      label: "Inicio",
      path: "/dashboard"
    },
    {
      icon: <ScanBarcode size={18} />,
      label: "Picking Libre",
      path: "/picking-libre"
    },
    {
      icon: <ClipboardList size={18} />,
      label: "Verificar Recepción",
      path: "/verificar-recepcion"
    },
    {
      icon: <Plus size={18} />,
      label: "Traslado entre sucursales",
      path: "/traslado-entre-sucursales"
    },
    {
      icon: <CreditCard size={18} />,
      label: "Crear Venta",
      path: "/crear-venta"
    },
    {
      icon: <FileSpreadsheet size={18} />,
      label: "Resumen de Ventas",
      path: "/resumen-ventas"
    },
    {
      icon: <Scale size={18} />,
      label: "Conciliaciones",
      path: "/conciliaciones",
      count: discrepanciesCount
    },
    {
      icon: <Package size={18} />,
      label: "Productos",
      path: "/products",
      children: [
        { label: 'Bins', path: '/productos/bins' },
        { label: 'Inventario', path: '/productos/inventario' },
        { label: 'Reportes de Inventario', path: '/productos/reportes-inventario' },
        { label: 'Ubicaciones', path: '/productos/ubicaciones' },
        { label: 'Mover productos', path: '/productos/mover' },
        { label: 'Ingreso de stock', path: '/productos/ingreso' },
        { label: 'Retiro de stock', path: '/productos/retirar' },
        { label: 'Logs de Stock', path: '/productos/logs' },
        { label: 'Productos Congelados', path: '/frozen-products' }
      ]
    },
    {
      icon: <ShoppingCart size={18} />,
      label: "Pedidos",
      path: "/orders",
      count: ordersCount,
      children: [
        { label: 'Tiendas físicas', path: '/orders/stores' },
        { label: 'Ventas', path: '/orders/sales' },
        { label: 'Página web', path: '/orders/shopify' },
        { label: 'Completados', path: '/orders/completed' },
        { label: 'Archivados', path: '/orders/archived' }
      ]
    },
    {
      icon: <Calculator size={18} />,
      label: "Contador de Productos",
      path: "/contador-productos"
    },
    {
      icon: <Search size={18} />,
      label: "Explorador de Códigos",
      path: "/explorador-codigos"
    },
    {
      icon: <Tag size={18} />,
      label: "Imprimir Etiquetas",
      path: "/imprimir-etiquetas"
    }
  ];


  // Filter sidebar items based on user permissions
  const sidebarItems = allSidebarItems.filter(item => {
    if (!profile) return false;
    
    // Special handling for picker role and cabeza de tienda
    const isPickerType = userType?.name === 'picker';
    const isCabezaTienda = userType?.name === 'cabeza_de_tienda';
    
    // Use permission-based system if user has user_type_id
    if (profile.user_type_id) {
      // Dashboard access
      if (item.path === '/dashboard') {
        return hasPermission('view_dashboard') || isPickerType || isCabezaTienda;
      }
      // Picking Libre access
      if (item.path === '/picking-libre') {
        return hasPermission('free_picking') || isPickerType || isAdmin();
      }
      // Verify reception access - available to everyone
      if (item.path === '/verificar-recepcion') {
        return true;
      }
      // Orders access
      if (item.path === '/orders') {
        return hasPermission('view_orders') || isPickerType || isCabezaTienda;
      }
      // Products access  
      if (item.path === '/products') {
        return hasPermission('manage_inventory') || hasPermission('view_inventory') || isPickerType || isCabezaTienda;
      }
      // Create sale access - cabeza de tienda should NOT have access
      if (item.path === '/crear-venta') {
        return hasPermission('create_sales') || hasPermission('manage_sales') || isPickerType;
      }
      // Sales report access - exclude cabeza_de_tienda
      if (item.path === '/resumen-ventas') {
        if (isCabezaTienda) return false;
        return hasPermission('view_sales') || hasPermission('manage_sales') || isAdmin();
      }
      // Product counter access - available to everyone
      if (item.path === '/contador-productos') {
        return true;
      }
      // Print labels access - available to everyone
      if (item.path === '/imprimir-etiquetas') {
        return true;
      }
      // Code explorer access - available to everyone
      if (item.path === '/explorador-codigos') {
        return true;
      }
      // Transfer access
      if (item.path === '/traslado-entre-sucursales') {
        return hasPermission('manage_transfers') || isPickerType || isCabezaTienda;
      }
      // Reconciliation access - only admins and supervisors
      if (item.path === '/conciliaciones') {
        return isAdmin() || userType?.name === 'supervisor' || hasPermission('view_reconciliation');
      }
      
      return false;
    }
    
    // Fallback to old role system for users without user_type_id
    if (profile.role === 'admin') return true;
    if (profile.role === 'vendedora') {
      return ['/', '/dashboard', '/traslado-entre-sucursales', '/crear-venta', '/products', '/orders'].includes(item.path);
    }
    
    return false;
  }).map(item => {
    // Apply children filtering based on permissions
    if (item.children) {
      if (item.path === '/products') {
        const isPickerType = userType?.name === 'picker';
        const filteredChildren = item.children.filter(child => {
          if (child.path === '/frozen-products') {
            return hasPermission('view_frozen_products') || isAdmin() || isPickerType;
          }
          if (child.path === '/productos/bins') {
            return hasPermission('view_bins') || hasPermission('create_bins') || hasPermission('manage_bins_all') || isPickerType;
          }
          if (child.path === '/productos/inventario') {
            // Bloquear inventario para pickers según especificación
            return !isPickerType && (hasPermission('view_inventory') || hasPermission('manage_inventory') || isAdmin());
          }
          if (child.path === '/productos/reportes-inventario') {
            // Solo administradores y supervisores pueden ver reportes de inventario
            return !isPickerType && (hasPermission('view_inventory') || hasPermission('manage_inventory') || isAdmin() || userType?.name === 'supervisor');
          }
          if (child.path === '/productos/ubicaciones') {
            return hasPermission('view_bins') || hasPermission('manage_bins_all') || isPickerType;
          }
          if (child.path === '/productos/mover') {
            return hasPermission('move_products') || hasPermission('manage_bins_all') || isPickerType;
          }
          if (child.path === '/productos/ingreso') {
            return hasPermission('stock_entry') || hasPermission('manage_stock') || hasPermission('manage_inventory') || isAdmin();
          }
          if (child.path === '/productos/retirar') {
            return hasPermission('stock_withdrawal') || hasPermission('manage_stock') || hasPermission('manage_inventory') || isAdmin();
          }
          if (child.path === '/productos/logs') {
            return hasPermission('view_stock_logs') || hasPermission('manage_inventory') || isAdmin() || userType?.name === 'supervisor';
          }
          
          // Fallback for old role system
          if (!profile?.user_type_id) {
            if (profile?.role === 'vendedora') {
              return false; 
            }
            return true;
          }
          
          return false;
        });
        
        return {
          ...item,
          children: filteredChildren
        };
      }
      if (item.path === '/orders') {
        const isPickerType = userType?.name === 'picker';
        const isCabezaTienda = userType?.name === 'cabeza_de_tienda';
        const filteredChildren = item.children.filter(child => {
          if (child.path === '/orders/stores') {
            return hasPermission('manage_physical_stores') || hasPermission('view_orders') || isPickerType || isCabezaTienda;
          }
          if (child.path === '/orders/sales') {
            return (hasPermission('view_orders') || isPickerType) && !isCabezaTienda;
          }
          if (child.path === '/orders/shopify') {
            return hasPermission('manage_shopify') || isPickerType;
          }
          if (child.path === '/orders/completed') {
            return hasPermission('view_orders') || isPickerType || userType?.name === 'supervisor';
          }
          if (child.path === '/orders/archived') {
            return hasPermission('view_orders') || isPickerType;
          }
          
          // Fallback for old role system
          if (profile?.role === 'vendedora') {
            return child.path === '/orders/stores' || child.path === '/orders/sales';
          }
          return true;
        });
        
        return {
          ...item,
          children: filteredChildren
        };
      }
    }
    return item;
  });

  const isActive = (path: string) => location.pathname === path;

  // Open menu if child is active
  useEffect(() => {
    sidebarItems.forEach(item => {
      if (item.children) {
        const hasActiveChild = item.children.some(child => location.pathname === child.path);
        if (hasActiveChild && !openMenus[item.path]) {
          setOpenMenus(prev => ({ ...prev, [item.path]: true }));
        }
      }
    });
  }, [location.pathname]);

  const toggleMenu = (path: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setOpenMenus(prev => ({ ...prev, [path]: !prev[path] }));
  };

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sidebarItems.map((item) => {
                const hasActiveChild = item.children?.some(child => location.pathname === child.path);
                const isOpen = openMenus[item.path] ?? false;
                
                if (item.children && item.children.length > 0) {
                  // Item with children - use Collapsible
                  return (
                    <Collapsible
                      key={item.path}
                      open={isOpen}
                      onOpenChange={() => toggleMenu(item.path)}
                      className="group/collapsible"
                    >
                      <SidebarMenuItem>
                        <div className="relative flex items-center">
                          <SidebarMenuButton 
                            asChild 
                            isActive={isActive(item.path) || hasActiveChild} 
                            className={`flex-1 ${item.count !== undefined && item.count > 0 ? 'pr-16' : 'pr-8'}`}
                          >
                            <NavLink to={item.path}>
                              {item.icon}
                              <span>{item.label}</span>
                            </NavLink>
                          </SidebarMenuButton>
                          {item.count !== undefined && item.count > 0 && (
                            <Badge 
                              className="absolute right-9 bg-primary text-primary-foreground px-2 py-0.5 h-5 text-xs"
                              variant="default"
                            >
                              {item.count}
                            </Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 h-6 w-6 p-0 hover:bg-accent"
                            onClick={(e) => toggleMenu(item.path, e)}
                          >
                            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                          </Button>
                        </div>
                        
                        <CollapsibleContent className="transition-all duration-200 data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                          <SidebarMenuSub>
                            {item.children.map((child) => (
                              <SidebarMenuSubItem key={child.path}>
                                <SidebarMenuSubButton asChild isActive={isActive(child.path)}>
                                  <NavLink to={child.path}>
                                    <span>{child.label}</span>
                                  </NavLink>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                }
                
                // Item without children - regular link
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton asChild isActive={isActive(item.path)}>
                      <NavLink to={item.path}>
                        {item.icon}
                        <span>{item.label}</span>
                        {item.count !== undefined && item.count > 0 && (
                          <SidebarMenuBadge className="bg-primary text-primary-foreground">
                            {item.count}
                          </SidebarMenuBadge>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarSeparator />
        
        {/* User info section */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton className="flex flex-col items-start gap-1 p-2 h-auto">
                  <div className="flex items-center gap-2 w-full">
                    <User size={16} className="flex-shrink-0" />
                    {state === 'expanded' && (
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-sm font-medium truncate">
                          {profile?.full_name || profile?.email}
                        </span>
                        <Badge variant="secondary" className="text-xs w-fit">
                          {userType?.display_name || (profile?.role === 'admin' ? 'Admin' : 'Vendedora')}
                        </Badge>
                      </div>
                    )}
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Actions section */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {(hasPermission('manage_configuration') || userType?.name === 'supervisor') && (
                <SidebarMenuItem>
                  <Sheet>
                    <SheetTrigger asChild>
                      <SidebarMenuButton>
                        <Settings size={16} />
                        <span>Configuración</span>
                      </SidebarMenuButton>
                    </SheetTrigger>
                    <SheetContent side="bottom" className="h-[80vh] p-0">
                      <SheetHeader className="p-6 pb-0">
                        <SheetTitle>Configuración del Sistema</SheetTitle>
                      </SheetHeader>
                      <ConfigurationSheet />
                    </SheetContent>
                  </Sheet>
                </SidebarMenuItem>
              )}
              
              <SidebarMenuItem>
                <SidebarMenuButton onClick={handleSignOut}>
                  <LogOut size={16} />
                  <span>Salir</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  );
}