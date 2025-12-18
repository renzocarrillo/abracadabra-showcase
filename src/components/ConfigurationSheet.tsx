import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import BSaleIntegration from '@/components/BSaleIntegration';
import { MigrationModeCard } from '@/components/MigrationModeCard';
import PinConfigurationSection from '@/components/PinConfigurationSection';
import { 
  Settings,
  Store, 
  Package, 
  Users, 
  CreditCard, 
  Truck, 
  FileText, 
  Bell,
  Database,
  Zap,
  Plus,
  Eye,
  EyeOff,
  Edit,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Image,
  X
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ConfigSection {
  id: string;
  label: string;
  icon: any;
  adminOnly?: boolean;
}

const configSections: ConfigSection[] = [
  { id: 'users', label: 'Usuarios', icon: Users },
  { id: 'stores', label: 'Tiendas', icon: Store },
  { id: 'store', label: 'Datos del almacén', icon: Store },
  { id: 'pin', label: 'PIN de Firma', icon: Settings },
  { id: 'system', label: 'Sistema', icon: AlertTriangle, adminOnly: true },
  { id: 'integrations', label: 'Integraciones', icon: Zap },
];

export function ConfigurationSheet() {
  const { profile } = useAuth();
  const { isAdmin, hasPermission } = usePermissions();
  const [activeSection, setActiveSection] = useState('users');
  const [users, setUsers] = useState<any[]>([]);
  const [tiendas, setTiendas] = useState<any[]>([]);
  const [userTypes, setUserTypes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateUserDialogOpen, setIsCreateUserDialogOpen] = useState(false);
  const [isCreateTiendaDialogOpen, setIsCreateTiendaDialogOpen] = useState(false);
  const [isEditTiendaDialogOpen, setIsEditTiendaDialogOpen] = useState(false);
  const [editingTienda, setEditingTienda] = useState<any>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '',
    full_name: '',
    password: '',
    role: 'vendedora' as 'admin' | 'vendedora'
  });
  const [newTienda, setNewTienda] = useState({
    nombre: '',
    address: '',
    city: '',
    district: '',
    officeid: '',
    pertenenceinnovacion: false
  });
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [shopifySyncSession, setShopifySyncSession] = useState<any>(null);
  const [shopifySyncDetails, setShopifySyncDetails] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSessionId, setSyncSessionId] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<{
    current: number;
    total: number;
    synced: number;
    failed: number;
  } | null>(null);
  const [isStoppingSync, setIsStoppingSync] = useState(false);
  const [syncDetailsPage, setSyncDetailsPage] = useState(0);
  const [syncDetailsFilter, setSyncDetailsFilter] = useState<'all' | 'success' | 'failed'>('all');
  
  // Estados para sincronización de imágenes
  const [isSyncingImages, setIsSyncingImages] = useState(false);
  const [imageSyncSession, setImageSyncSession] = useState<any>(null);
  const [forceRefreshImages, setForceRefreshImages] = useState(false);
  
  const { toast } = useToast();

  // Fetch user types on mount
  useEffect(() => {
    const fetchUserTypes = async () => {
      const { data } = await supabase
        .from('user_types')
        .select('*');
      setUserTypes(data || []);
    };
    fetchUserTypes();
  }, []);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los usuarios",
        variant: "destructive",
      });
    }
  };

  const createUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.full_name) {
      toast({
        title: "Error",
        description: "Todos los campos son obligatorios",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No hay sesión activa');
      }

      const response = await fetch('https://cflyvlkpbodtutyikfbk.supabase.co/functions/v1/create-user', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmbHl2bGtwYm9kdHV0eWlrZmJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0OTY1NTMsImV4cCI6MjA3MjA3MjU1M30.C9rhSTvKPl4eYnNA6ONTmyjwrrtssoVpJdcPKgI_i10',
        },
        body: JSON.stringify(newUser)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error creating user');
      }

      toast({
        title: "Usuario creado",
        description: `Usuario ${newUser.email} creado exitosamente`,
      });

      setNewUser({ email: '', full_name: '', password: '', role: 'vendedora' });
      setIsCreateUserDialogOpen(false);
      await fetchUsers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo crear el usuario",
        variant: "destructive",
      });
    }
    setIsLoading(false);
  };

  const fetchShopifySyncSession = async () => {
    try {
      // Primero buscar si hay alguna sesión en progreso
      let { data, error } = await supabase
        .from('shopify_sync_sessions')
        .select('*')
        .eq('status', 'in_progress')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Si no hay en progreso, obtener la más reciente
      if (!data) {
        const result = await supabase
          .from('shopify_sync_sessions')
          .select('*')
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (result.error) throw result.error;
        data = result.data;
      }

      if (error) throw error;

      // Detectar sesiones zombie (más de 5 minutos sin actualización)
      if (data && data.status === 'in_progress') {
        const lastUpdate = new Date(data.updated_at).getTime();
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;

        if (now - lastUpdate > fiveMinutes) {
          console.warn('[SHOPIFY_SYNC] Zombie session detected:', data.id);
          // Marcar como fallida
          await supabase
            .from('shopify_sync_sessions')
            .update({
              status: 'failed',
              error_message: 'Sesión abandonada - timeout detectado por frontend',
            })
            .eq('id', data.id);

          // Refrescar datos
          const { data: refreshedData } = await supabase
            .from('shopify_sync_sessions')
            .select('*')
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          data = refreshedData;
        }
      }

      setShopifySyncSession(data);
      setIsSyncing(data?.status === 'in_progress');
    } catch (error) {
      console.error('Error fetching shopify sync session:', error);
    }
  };

  const fetchShopifySyncDetails = async () => {
    if (!shopifySyncSession?.id) return;

    try {
      const PAGE_SIZE = 10;
      const from = syncDetailsPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from('shopify_sync_details')
        .select('*')
        .eq('session_id', shopifySyncSession.id)
        .order('synced_at', { ascending: false })
        .range(from, to);

      if (syncDetailsFilter !== 'all') {
        query = query.eq('status', syncDetailsFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setShopifySyncDetails(data || []);
    } catch (error) {
      console.error('Error fetching shopify sync details:', error);
    }
  };

  const triggerShopifySync = async () => {
    if (!isAdmin()) {
      toast({
        title: "Error",
        description: "No tienes permisos para sincronizar productos",
        variant: "destructive",
      });
      return;
    }

    setIsSyncing(true);
    try {
      const { data, error } = await supabase.rpc('trigger_shopify_sync');

      if (error) throw error;

      const result = data as { success: boolean; error?: string } | null;

      if (result && !result.success) {
        throw new Error(result.error || 'Error desconocido');
      }

      toast({
        title: "Sincronización iniciada",
        description: "La sincronización de productos con Shopify ha comenzado",
      });

      setTimeout(fetchShopifySyncSession, 2000);
    } catch (error: any) {
      console.error('Error triggering sync:', error);
      setIsSyncing(false);
      toast({
        title: "Error",
        description: error.message || "No se pudo iniciar la sincronización",
        variant: "destructive",
      });
    }
  };

  const cancelShopifySync = async () => {
    if (!shopifySyncSession?.id) return;
    
    if (!isAdmin()) {
      toast({
        title: "Error",
        description: "No tienes permisos para detener la sincronización",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const { error } = await supabase
        .from('shopify_sync_sessions')
        .update({ 
          status: 'failed',
          error_message: 'Sincronización cancelada por el usuario',
          completed_at: new Date().toISOString()
        })
        .eq('id', shopifySyncSession.id);
      
      if (error) throw error;
      
      toast({
        title: "Sincronización cancelada",
        description: "La sincronización se ha detenido",
      });
      
      setIsSyncing(false);
      fetchShopifySyncSession();
    } catch (error: any) {
      console.error('Error cancelling sync:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo cancelar la sincronización",
        variant: "destructive",
      });
    }
  };

  const fetchImageSyncSession = async () => {
    try {
      // Buscar sesión en progreso o la más reciente
      let { data, error } = await supabase
        .from('shopify_image_sync_sessions')
        .select('*')
        .eq('status', 'in_progress')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data) {
        const result = await supabase
          .from('shopify_image_sync_sessions')
          .select('*')
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (result.error) throw result.error;
        data = result.data;
      }

      if (error) throw error;

      // Detectar sesiones zombie (más de 5 minutos sin actualización)
      if (data && data.status === 'in_progress') {
        const lastUpdate = new Date(data.updated_at).getTime();
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;

        if (now - lastUpdate > fiveMinutes) {
          console.warn('[IMAGE_SYNC] Zombie session detected:', data.id);
          await supabase
            .from('shopify_image_sync_sessions')
            .update({
              status: 'failed',
              error_message: 'Sesión abandonada - timeout detectado por frontend',
            })
            .eq('id', data.id);

          const { data: refreshedData } = await supabase
            .from('shopify_image_sync_sessions')
            .select('*')
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          data = refreshedData;
        }
      }

      setImageSyncSession(data);
      setIsSyncingImages(data?.status === 'in_progress');
    } catch (error) {
      console.error('Error fetching image sync session:', error);
    }
  };

  const triggerImageSync = async () => {
    if (!isAdmin()) {
      toast({
        title: "Error",
        description: "No tienes permisos para sincronizar imágenes",
        variant: "destructive",
      });
      return;
    }

    setIsSyncingImages(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('sync-shopify-images', {
        body: { 
          force_refresh: forceRefreshImages,
          started_by: profile?.id 
        }
      });

      if (error) throw error;

      toast({
        title: "Sincronización iniciada",
        description: "La sincronización de imágenes ha comenzado en lotes pequeños",
      });

      setTimeout(fetchImageSyncSession, 2000);
    } catch (error: any) {
      console.error('Error syncing images:', error);
      setIsSyncingImages(false);
      toast({
        title: "Error",
        description: error.message || "No se pudieron sincronizar las imágenes",
        variant: "destructive"
      });
    }
  };

  const cancelImageSync = async () => {
    if (!imageSyncSession?.id) return;
    
    if (!isAdmin()) {
      toast({
        title: "Error",
        description: "No tienes permisos para detener la sincronización",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const { error } = await supabase
        .from('shopify_image_sync_sessions')
        .update({ 
          status: 'cancelled',
          error_message: 'Sincronización cancelada por el usuario',
          completed_at: new Date().toISOString()
        })
        .eq('id', imageSyncSession.id);
      
      if (error) throw error;
      
      toast({
        title: "Sincronización cancelada",
        description: "La sincronización se detendrá después del lote actual",
      });
      
      setIsSyncingImages(false);
      fetchImageSyncSession();
    } catch (error: any) {
      console.error('Error cancelling image sync:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo cancelar la sincronización",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (activeSection === 'integrations') {
      fetchShopifySyncSession();
      fetchImageSyncSession();
    }
  }, [activeSection]);

  useEffect(() => {
    if (activeSection === 'integrations') {
      // Hacer polling siempre para detectar sesiones en progreso
      const interval = setInterval(() => {
        fetchShopifySyncSession();
        fetchImageSyncSession();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [activeSection]);

  useEffect(() => {
    if (shopifySyncSession?.id) {
      fetchShopifySyncDetails();
    }
  }, [shopifySyncSession?.id, syncDetailsPage, syncDetailsFilter]);

  const fetchTiendas = async () => {
    try {
      const { data, error } = await supabase
        .from('tiendas')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTiendas(data || []);
    } catch (error) {
      console.error('Error fetching tiendas:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las tiendas",
        variant: "destructive",
      });
    }
  };

  const createTienda = async () => {
    if (!newTienda.nombre) {
      toast({
        title: "Error",
        description: "El nombre de la tienda es obligatorio",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('tiendas')
        .insert([newTienda])
        .select();

      if (error) throw error;

      toast({
        title: "Tienda creada",
        description: `Tienda ${newTienda.nombre} creada exitosamente`,
      });

      setNewTienda({
        nombre: '',
        address: '',
        city: '',
        district: '',
        officeid: '',
        pertenenceinnovacion: false
      });
      setIsCreateTiendaDialogOpen(false);
      await fetchTiendas();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo crear la tienda",
        variant: "destructive",
      });
    }
    setIsLoading(false);
  };

  const openEditTienda = (tienda: any) => {
    setEditingTienda({
      id: tienda.id,
      nombre: tienda.nombre,
      address: tienda.address || '',
      city: tienda.city || '',
      district: tienda.district || '',
      officeid: tienda.officeid || '',
      pertenenceinnovacion: tienda.pertenenceinnovacion || false
    });
    setIsEditTiendaDialogOpen(true);
  };

  const updateTienda = async () => {
    if (!editingTienda.nombre) {
      toast({
        title: "Error",
        description: "El nombre de la tienda es obligatorio",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('tiendas')
        .update({
          nombre: editingTienda.nombre,
          address: editingTienda.address,
          city: editingTienda.city,
          district: editingTienda.district,
          officeid: editingTienda.officeid,
          pertenenceinnovacion: editingTienda.pertenenceinnovacion
        })
        .eq('id', editingTienda.id);

      if (error) throw error;

      toast({
        title: "Tienda actualizada",
        description: `Tienda ${editingTienda.nombre} actualizada exitosamente`,
      });

      setEditingTienda(null);
      setIsEditTiendaDialogOpen(false);
      await fetchTiendas();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar la tienda",
        variant: "destructive",
      });
    }
    setIsLoading(false);
  };

  const handleStockReset = async () => {
    if (!resetPassword.trim()) {
      toast({
        title: "Error",
        description: "La contraseña es obligatoria",
        variant: "destructive",
      });
      return;
    }

    // Double-check admin permissions before proceeding
    if (!isAdmin()) {
      toast({
        title: "Error",
        description: "Solo los administradores pueden resetear el sistema",
        variant: "destructive",
      });
      return;
    }

    setIsResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke('stock-system-reset', {
        body: { password: resetPassword }
      });

      if (error) {
        // Surface server error details from Edge Function
        const serverMsg = (data as any)?.error || (data as any)?.details || error.message;
        throw new Error(serverMsg);
      }

      if (data.success) {
        toast({
          title: "Sistema reseteado",
          description: `${data.message}. ${data.stockRestored} productos restaurados al bin Transito.`,
          duration: 5000,
        });
        setResetPassword('');
        setIsResetDialogOpen(false);
      } else {
        const errorMsg = data.error || data.details || 'Error desconocido';
        throw new Error(errorMsg);
      }
    } catch (error: any) {
      const msg: string = error?.message || 'No se pudo resetear el sistema';
      toast({
        title: "Error",
        description: msg,
        variant: "destructive",
      });
    }
    setIsResetting(false);
  };

  useEffect(() => {
    if (activeSection === 'users') {
      fetchUsers();
    }
    if (activeSection === 'stores') {
      fetchTiendas();
    }
  }, [activeSection]);

  const renderContent = () => {
    switch (activeSection) {

      case 'users':
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Gestión de Usuarios y Permisos</CardTitle>
                <CardDescription>
                  Configura tipos de usuario, permisos y gestiona usuarios del sistema
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(isAdmin() || hasPermission('manage_user_types')) && (
                    <Card className="border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 transition-colors">
                      <CardHeader className="text-center">
                        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                          <Users className="h-6 w-6 text-primary" />
                        </div>
                        <CardTitle className="text-lg">Tipos de Usuario</CardTitle>
                        <CardDescription>
                          Crea y configura tipos de usuario con permisos específicos
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button 
                          className="w-full"
                          onClick={() => window.open('/admin/user-types', '_blank')}
                        >
                          Gestionar Tipos de Usuario
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  <Card className="border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 transition-colors">
                    <CardHeader className="text-center">
                      <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                        <Settings className="h-6 w-6 text-primary" />
                      </div>
                      <CardTitle className="text-lg">Gestión de Usuarios</CardTitle>
                      <CardDescription>
                        Administra usuarios y asigna tipos de usuario
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button 
                        className="w-full"
                        onClick={() => window.open('/admin/users', '_blank')}
                      >
                        Gestionar Usuarios
                      </Button>
                    </CardContent>
                  </Card>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Usuarios Actuales del Sistema</h3>
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Usuario</TableHead>
                          <TableHead>Rol</TableHead>
                          <TableHead>Estado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map((user: any) => (
                          <TableRow key={user.id}>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-medium">{user.full_name || 'Sin nombre'}</div>
                                <div className="text-sm text-muted-foreground">{user.email}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={user.role === 'admin' ? 'destructive' : 'default'}>
                                {user.role === 'admin' ? 'Administrador' : 'Vendedora'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">Activo</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  
                  <div className="text-sm text-muted-foreground">
                    Para gestión completa de usuarios y permisos, utiliza las herramientas dedicadas arriba.
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'stores':
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Gestión de Tiendas</CardTitle>
                    <CardDescription>
                      Administra las tiendas del sistema
                    </CardDescription>
                  </div>
                  <Dialog open={isCreateTiendaDialogOpen} onOpenChange={setIsCreateTiendaDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="flex items-center gap-2">
                        <Plus size={16} />
                        Agregar tienda
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Crear nueva tienda</DialogTitle>
                        <DialogDescription>
                          Ingresa los datos de la nueva tienda
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="tiendaNombre">Nombre de la tienda *</Label>
                          <Input
                            id="tiendaNombre"
                            placeholder="Nombre de la tienda"
                            value={newTienda.nombre}
                            onChange={(e) => setNewTienda({ ...newTienda, nombre: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="tiendaAddress">Dirección</Label>
                          <Input
                            id="tiendaAddress"
                            placeholder="Dirección de la tienda"
                            value={newTienda.address}
                            onChange={(e) => setNewTienda({ ...newTienda, address: e.target.value })}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="tiendaCity">Ciudad</Label>
                            <Input
                              id="tiendaCity"
                              placeholder="Ciudad"
                              value={newTienda.city}
                              onChange={(e) => setNewTienda({ ...newTienda, city: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="tiendaDistrict">Distrito</Label>
                            <Input
                              id="tiendaDistrict"
                              placeholder="Distrito"
                              value={newTienda.district}
                              onChange={(e) => setNewTienda({ ...newTienda, district: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="tiendaOfficeId">Office ID</Label>
                          <Input
                            id="tiendaOfficeId"
                            placeholder="ID de oficina"
                            value={newTienda.officeid}
                            onChange={(e) => setNewTienda({ ...newTienda, officeid: e.target.value })}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label>Pertenece a Innovación</Label>
                            <p className="text-sm text-muted-foreground">
                              Marcar si la tienda pertenece al grupo Innovación
                            </p>
                          </div>
                          <Switch
                            checked={newTienda.pertenenceinnovacion}
                            onCheckedChange={(checked) => setNewTienda({ ...newTienda, pertenenceinnovacion: checked })}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setIsCreateTiendaDialogOpen(false)}
                        >
                          Cancelar
                        </Button>
                        <Button onClick={createTienda} disabled={isLoading}>
                          {isLoading ? "Creando..." : "Crear tienda"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  
                  {/* Diálogo de Editar Tienda */}
                  <Dialog open={isEditTiendaDialogOpen} onOpenChange={setIsEditTiendaDialogOpen}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Editar tienda</DialogTitle>
                        <DialogDescription>
                          Modifica los datos de la tienda
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="editTiendaNombre">Nombre de la tienda *</Label>
                          <Input
                            id="editTiendaNombre"
                            placeholder="Nombre de la tienda"
                            value={editingTienda?.nombre || ''}
                            onChange={(e) => setEditingTienda({ ...editingTienda, nombre: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="editTiendaAddress">Dirección</Label>
                          <Input
                            id="editTiendaAddress"
                            placeholder="Dirección de la tienda"
                            value={editingTienda?.address || ''}
                            onChange={(e) => setEditingTienda({ ...editingTienda, address: e.target.value })}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="editTiendaCity">Ciudad</Label>
                            <Input
                              id="editTiendaCity"
                              placeholder="Ciudad"
                              value={editingTienda?.city || ''}
                              onChange={(e) => setEditingTienda({ ...editingTienda, city: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="editTiendaDistrict">Distrito</Label>
                            <Input
                              id="editTiendaDistrict"
                              placeholder="Distrito"
                              value={editingTienda?.district || ''}
                              onChange={(e) => setEditingTienda({ ...editingTienda, district: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="editTiendaOfficeId">Office ID</Label>
                          <Input
                            id="editTiendaOfficeId"
                            placeholder="ID de oficina"
                            value={editingTienda?.officeid || ''}
                            onChange={(e) => setEditingTienda({ ...editingTienda, officeid: e.target.value })}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label>Pertenece a Innovación</Label>
                            <p className="text-sm text-muted-foreground">
                              Marcar si la tienda pertenece al grupo Innovación
                            </p>
                          </div>
                          <Switch
                            checked={editingTienda?.pertenenceinnovacion || false}
                            onCheckedChange={(checked) => setEditingTienda({ ...editingTienda, pertenenceinnovacion: checked })}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setIsEditTiendaDialogOpen(false)}
                        >
                          Cancelar
                        </Button>
                        <Button onClick={updateTienda} disabled={isLoading}>
                          {isLoading ? "Actualizando..." : "Actualizar tienda"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tienda</TableHead>
                        <TableHead>Ciudad</TableHead>
                        <TableHead>Distrito</TableHead>
                        <TableHead>Office ID</TableHead>
                        <TableHead>Innovación</TableHead>
                        <TableHead>Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tiendas.map((tienda) => (
                        <TableRow key={tienda.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{tienda.nombre}</div>
                              <div className="text-sm text-muted-foreground">{tienda.address || 'Sin dirección'}</div>
                            </div>
                          </TableCell>
                          <TableCell>{tienda.city || '-'}</TableCell>
                          <TableCell>{tienda.district || '-'}</TableCell>
                          <TableCell>{tienda.officeid || '-'}</TableCell>
                          <TableCell>
                            {tienda.pertenenceinnovacion ? (
                              <Badge variant="default">Sí</Badge>
                            ) : (
                              <Badge variant="secondary">No</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditTienda(tienda)}
                              className="h-8 w-8 p-0"
                            >
                              <Edit size={14} />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {tiendas.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                            No hay tiendas registradas
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'store':
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Datos de la tienda</CardTitle>
                <CardDescription>
                  Información básica de tu negocio
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="storeName">Nombre de la tienda</Label>
                  <Input id="storeName" placeholder="Pelo de Oso" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="storeEmail">Email de contacto</Label>
                  <Input id="storeEmail" placeholder="contacto@empresa.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="storeAddress">Dirección de facturación</Label>
                  <Input id="storeAddress" placeholder="Dirección completa" />
                </div>
                <Button>Guardar cambios</Button>
              </CardContent>
            </Card>
          </div>
        );

      case 'system':
        // Check if user is admin or supervisor
        const isAdminOrSupervisor = isAdmin() || 
          (profile?.user_type_id && userTypes?.some(
            (ut: any) => ut.id === profile.user_type_id && 
            (ut.name === 'admin' || ut.name === 'supervisor')
          ));

        if (!isAdminOrSupervisor) {
          return (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold text-muted-foreground">Acceso Restringido</h3>
                <p className="text-muted-foreground">Solo administradores y supervisores pueden acceder a esta sección.</p>
              </div>
            </div>
          );
        }

        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Sistema</h2>
              <p className="text-sm text-muted-foreground">
                Configuración avanzada del sistema
              </p>
            </div>

            <MigrationModeCard />
            
            {/* Admin Tools Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Logs de Auditoría</CardTitle>
                  <CardDescription>
                    Consulta el historial detallado de operaciones del sistema Picking Libre
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    className="w-full"
                    onClick={() => window.open('/admin/picking-audit-logs', '_blank')}
                  >
                    Ver Logs de Auditoría
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Sesiones Zombie</CardTitle>
                  <CardDescription>
                    Monitorea y recupera sesiones abandonadas o con errores
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    className="w-full"
                    onClick={() => window.open('/admin/zombie-sessions', '_blank')}
                  >
                    Dashboard de Zombies
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recuperar Pickings</CardTitle>
                  <CardDescription>
                    Recupera sesiones de picking libre fallidas
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    className="w-full"
                    onClick={() => window.open('/admin/recover-free-pickings', '_blank')}
                  >
                    Recuperar Pickings Fallidos
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Diagnóstico de Asignaciones</CardTitle>
                  <CardDescription>
                    Analiza y diagnostica problemas en las asignaciones de pedidos
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    className="w-full"
                    onClick={() => window.open('/admin/diagnostico-asignaciones', '_blank')}
                  >
                    Ver Diagnósticos
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Ventas Atascadas</CardTitle>
                  <CardDescription>
                    Detecta y corrige ventas con documentos emitidos que no fueron archivadas
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    className="w-full"
                    onClick={() => window.open('/admin/stuck-sales-recovery', '_blank')}
                  >
                    Recuperar Ventas
                  </Button>
                </CardContent>
              </Card>
            </div>
            
            {isAdmin() && (
              <>
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Zona Peligrosa</AlertTitle>
                  <AlertDescription>
                    Las siguientes acciones son irreversibles y afectarán permanentemente los datos del sistema.
                  </AlertDescription>
                </Alert>

                <Card className="border-destructive">
                  <CardHeader>
                    <CardTitle className="text-destructive flex items-center gap-2">
                      <AlertTriangle size={20} />
                      Reset del Sistema - PELIGRO
                    </CardTitle>
                    <CardDescription>
                      Esta función es altamente destructiva y no se puede deshacer. Cancela todas las órdenes pendientes, elimina todo el stock existente y lo reemplaza con el stock base del sistema.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-4 border border-destructive/20 rounded-lg bg-destructive/5">
                      <h4 className="font-semibold text-destructive mb-2">⚠️ Esta acción hará lo siguiente:</h4>
                      <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                        <li>Cancelará y archivará todas las órdenes pendientes</li>
                        <li>Cancelará y archivará todas las ventas pendientes</li>
                        <li>Eliminará TODO el stock existente en todos los bins</li>
                        <li>Limpiará todas las asignaciones de stock</li>
                        <li>Importará el stock desde la tabla base (almCentral)</li>
                        <li>Colocará todo el stock importado en el bin "Transito"</li>
                      </ul>
                    </div>
                    
                    <AlertDialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" className="w-full" size="lg">
                          <AlertTriangle className="mr-2 h-4 w-4" />
                          RESETEAR SISTEMA COMPLETO
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-destructive">
                            ⚠️ CONFIRMACIÓN DE RESET DEL SISTEMA
                          </AlertDialogTitle>
                          <AlertDialogDescription className="space-y-3">
                            <p className="font-semibold">
                              Esta acción es IRREVERSIBLE y eliminará TODOS los datos de stock y órdenes actuales.
                            </p>
                            <p>
                              Por favor, ingrese su contraseña para confirmar que desea proceder con esta operación destructiva:
                            </p>
                            <div className="space-y-2">
                              <Label htmlFor="resetPassword">Contraseña</Label>
                              <Input
                                id="resetPassword"
                                type="password"
                                placeholder="Ingrese su contraseña"
                                value={resetPassword}
                                onChange={(e) => setResetPassword(e.target.value)}
                                className="mt-2"
                              />
                            </div>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel 
                            onClick={() => {
                              setResetPassword('');
                              setIsResetDialogOpen(false);
                            }}
                          >
                            Cancelar
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleStockReset}
                            disabled={isResetting || !resetPassword.trim()}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {isResetting ? "Reseteando..." : "SÍ, RESETEAR SISTEMA"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        );

      case 'pin':
        // Only show PIN configuration to users who can sign orders
        if (!isAdmin() && !hasPermission('sign_orders')) {
          return (
            <div className="space-y-6">
              <Card>
                <CardContent className="py-6">
                  <p className="text-sm text-muted-foreground">
                    No tienes permisos para configurar PIN de firma.
                  </p>
                </CardContent>
              </Card>
            </div>
          );
        }
        
        return (
          <div className="space-y-6">
            <PinConfigurationSection />
          </div>
        );

      case 'integrations':
        const syncProgress = shopifySyncSession 
          ? Math.round((shopifySyncSession.products_synced / shopifySyncSession.total_products) * 100)
          : 0;

        const getStatusBadge = () => {
          if (!shopifySyncSession) return null;
          
          switch (shopifySyncSession.status) {
            case 'in_progress':
              return <Badge variant="secondary" className="gap-1"><RefreshCw className="h-3 w-3 animate-spin" />En progreso</Badge>;
            case 'completed':
              return <Badge variant="default" className="gap-1 bg-green-500"><CheckCircle2 className="h-3 w-3" />Completada</Badge>;
            case 'failed':
              return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Fallida</Badge>;
            default:
              return <Badge variant="secondary">Desconocido</Badge>;
          }
        };

        const formatDate = (dateString: string) => {
          if (!dateString) return '-';
          return new Date(dateString).toLocaleString('es-PE', {
            dateStyle: 'short',
            timeStyle: 'short',
          });
        };

        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Shopify
                </CardTitle>
                <CardDescription>
                  Sincronización de productos y pedidos
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Connection Status */}
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Estado de la conexión</p>
                    <p className="text-xs text-muted-foreground">
                      Webhook: <code className="bg-muted px-1 rounded">orders/paid</code>
                    </p>
                  </div>
                  <Badge variant="secondary">✓ Conectado</Badge>
                </div>

                <Separator />

                {/* Sync Status */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Sincronización de Productos</h3>
                    {getStatusBadge()}
                  </div>

                  {shopifySyncSession && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Iniciada</p>
                          <p className="text-sm font-medium">{formatDate(shopifySyncSession.started_at)}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Finalizada</p>
                          <p className="text-sm font-medium">{formatDate(shopifySyncSession.completed_at)}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Total productos</p>
                          <p className="text-sm font-medium">{shopifySyncSession.total_products}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Lote actual</p>
                          <p className="text-sm font-medium">
                            {shopifySyncSession.current_batch} / {shopifySyncSession.total_batches}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          <div className="space-y-0.5">
                            <p className="text-xs text-muted-foreground">Sincronizados</p>
                            <p className="text-lg font-bold text-green-600">{shopifySyncSession.products_synced}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-red-500" />
                          <div className="space-y-0.5">
                            <p className="text-xs text-muted-foreground">Fallidos</p>
                            <p className="text-lg font-bold text-red-600">{shopifySyncSession.products_failed}</p>
                          </div>
                        </div>
                      </div>

                      {shopifySyncSession.status === 'in_progress' && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Progreso</span>
                            <span className="font-medium">{syncProgress}%</span>
                          </div>
                          <Progress value={syncProgress} className="h-2" />
                          <p className="text-xs text-muted-foreground">
                            Sincronización en micro-lotes de 100 productos. El proceso continúa automáticamente.
                          </p>
                        </div>
                      )}

                      {shopifySyncSession.error_message && (
                        <Alert variant="destructive">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertTitle>Error de sincronización</AlertTitle>
                          <AlertDescription className="text-xs">
                            {shopifySyncSession.error_message}
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}

                  {!shopifySyncSession && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No hay sincronizaciones registradas</p>
                    </div>
                  )}

                  <div className="flex gap-2 mt-4">
                    <Button 
                      onClick={triggerShopifySync}
                      disabled={isSyncing || !isAdmin()}
                      className="flex-1"
                    >
                      {isSyncing ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Sincronizando...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Sincronizar ahora
                        </>
                      )}
                    </Button>
                    
                    <Button
                      onClick={fetchShopifySyncSession}
                      variant="outline"
                      size="default"
                      title="Actualizar estado de sincronización"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    
                    {shopifySyncSession?.status === 'in_progress' && isAdmin() && (
                      <Button
                        onClick={cancelShopifySync}
                        variant="destructive"
                        size="default"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Detener
                      </Button>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground mt-2">
                    {isAdmin() 
                      ? "La sincronización automática se ejecuta diariamente a la 1:00 AM."
                      : "Solo administradores pueden sincronizar manualmente."}
                  </p>
                </div>

                {/* Sync Details Table */}
                {shopifySyncSession && shopifySyncDetails.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold">Detalles de Sincronización</h3>
                        <Select value={syncDetailsFilter} onValueChange={(value: any) => {
                          setSyncDetailsFilter(value);
                          setSyncDetailsPage(0);
                        }}>
                          <SelectTrigger className="w-[140px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos</SelectItem>
                            <SelectItem value="success">Exitosos</SelectItem>
                            <SelectItem value="failed">Fallidos</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="border rounded-md">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Producto</TableHead>
                              <TableHead>Estado</TableHead>
                              <TableHead>Lote</TableHead>
                              <TableHead>Fecha</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {shopifySyncDetails.map((detail) => (
                              <TableRow key={detail.id}>
                                <TableCell className="font-medium text-xs">
                                  {detail.product_name}
                                  {detail.error_message && (
                                    <p className="text-xs text-red-500 mt-1">{detail.error_message}</p>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {detail.status === 'success' ? (
                                    <Badge variant="default" className="bg-green-500">✓</Badge>
                                  ) : (
                                    <Badge variant="destructive">✗</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-xs">{detail.batch_number}</TableCell>
                                <TableCell className="text-xs">{formatDate(detail.synced_at)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      <div className="flex items-center justify-between mt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSyncDetailsPage(p => Math.max(0, p - 1))}
                          disabled={syncDetailsPage === 0}
                        >
                          Anterior
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          Página {syncDetailsPage + 1}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSyncDetailsPage(p => p + 1)}
                          disabled={shopifySyncDetails.length < 10}
                        >
                          Siguiente
                        </Button>
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                {/* Image Sync Section */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Image className="h-5 w-5" />
                      Sincronización de Imágenes
                    </h3>
                    {imageSyncSession && (() => {
                      switch (imageSyncSession.status) {
                        case 'in_progress':
                          return <Badge variant="secondary" className="gap-1"><RefreshCw className="h-3 w-3 animate-spin" />En progreso</Badge>;
                        case 'completed':
                          return <Badge variant="default" className="gap-1 bg-green-500"><CheckCircle2 className="h-3 w-3" />Completada</Badge>;
                        case 'failed':
                          return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Fallida</Badge>;
                        case 'cancelled':
                          return <Badge variant="secondary" className="gap-1"><XCircle className="h-3 w-3" />Cancelada</Badge>;
                        default:
                          return null;
                      }
                    })()}
                  </div>

                  <p className="text-sm text-muted-foreground mb-4">
                    Sincroniza las imágenes de productos desde Shopify para visualizarlas en Abracadabra
                  </p>

                  {imageSyncSession && (
                    <div className="space-y-4 mb-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Iniciada</p>
                          <p className="text-sm font-medium">{formatDate(imageSyncSession.started_at)}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Finalizada</p>
                          <p className="text-sm font-medium">{formatDate(imageSyncSession.completed_at)}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Total productos</p>
                          <p className="text-sm font-medium">{imageSyncSession.total_products}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Lote actual</p>
                          <p className="text-sm font-medium">
                            {imageSyncSession.current_batch} / {imageSyncSession.total_batches}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          <div className="space-y-0.5">
                            <p className="text-xs text-muted-foreground">Sincronizados</p>
                            <p className="text-lg font-bold text-green-600">{imageSyncSession.products_synced}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-yellow-500" />
                          <div className="space-y-0.5">
                            <p className="text-xs text-muted-foreground">Omitidos</p>
                            <p className="text-lg font-bold text-yellow-600">{imageSyncSession.products_skipped}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-red-500" />
                          <div className="space-y-0.5">
                            <p className="text-xs text-muted-foreground">Fallidos</p>
                            <p className="text-lg font-bold text-red-600">{imageSyncSession.products_failed}</p>
                          </div>
                        </div>
                      </div>

                      {imageSyncSession.status === 'in_progress' && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Progreso</span>
                            <span className="font-medium">
                              {Math.round(((imageSyncSession.products_synced + imageSyncSession.products_failed + imageSyncSession.products_skipped) / imageSyncSession.total_products) * 100)}%
                            </span>
                          </div>
                          <Progress 
                            value={((imageSyncSession.products_synced + imageSyncSession.products_failed + imageSyncSession.products_skipped) / imageSyncSession.total_products) * 100} 
                            className="h-2" 
                          />
                          <p className="text-xs text-muted-foreground">
                            Sincronización en micro-lotes de 50 productos. El proceso continúa automáticamente.
                          </p>
                        </div>
                      )}

                      {imageSyncSession.error_message && (
                        <Alert variant="destructive">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertTitle>Error de sincronización</AlertTitle>
                          <AlertDescription className="text-xs">
                            {imageSyncSession.error_message}
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}

                  {!imageSyncSession && (
                    <div className="text-center py-8 text-muted-foreground mb-4">
                      <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No hay sincronizaciones de imágenes registradas</p>
                    </div>
                  )}

                  <div className="flex items-center gap-2 mb-4">
                    <input
                      type="checkbox"
                      id="force-refresh-images"
                      checked={forceRefreshImages}
                      onChange={(e) => setForceRefreshImages(e.target.checked)}
                      className="h-4 w-4 rounded border-input"
                    />
                    <Label htmlFor="force-refresh-images" className="text-sm cursor-pointer">
                      Forzar actualización (ignorar caché de 24h)
                    </Label>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={triggerImageSync}
                      disabled={isSyncingImages || imageSyncSession?.status === 'in_progress' || !isAdmin()}
                      className="flex-1"
                    >
                      {isSyncingImages ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Sincronizando...
                        </>
                      ) : (
                        <>
                          <Image className="h-4 w-4 mr-2" />
                          Sincronizar imágenes
                        </>
                      )}
                    </Button>
                    
                    {imageSyncSession?.status === 'in_progress' && (
                      <Button
                        onClick={cancelImageSync}
                        variant="destructive"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Detener
                      </Button>
                    )}
                  </div>

                  <div className="mt-4 p-3 bg-muted/50 rounded-md">
                    <p className="text-sm font-medium mb-2">📋 Instrucciones</p>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      <li>• Primero sincroniza tus productos con Shopify</li>
                      <li>• Luego carga las imágenes en tu panel de Shopify</li>
                      <li>• Finalmente ejecuta esta sincronización para cachear las URLs</li>
                      <li>• Las imágenes estarán disponibles en los detalles del producto</li>
                      <li>• El caché se mantiene por 24 horas para optimizar rendimiento</li>
                      <li>• Usa "Forzar actualización" si subiste imágenes nuevas en Shopify</li>
                    </ul>
                  </div>
                </div>

                <Separator />
                
                <BSaleIntegration />
              </CardContent>
            </Card>
          </div>
        );

      default:
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Sección en desarrollo</CardTitle>
                <CardDescription>
                  Esta sección estará disponible próximamente
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        );
    }
  };

  return (
    <div className="flex h-[calc(80vh)] max-h-[600px]">
      {/* Sidebar */}
      <div className="w-64 border-r bg-muted/20">
        <div className="p-4">
          <h3 className="font-semibold text-lg mb-4">Configuración</h3>
          <nav className="space-y-1">
            {configSections
              .filter(section => {
                // Hide admin-only sections from non-admin users
                if (section.adminOnly && profile?.role !== 'admin') {
                  return false;
                }
                return true;
              })
              .map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md text-left transition-colors ${
                  activeSection === section.id
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                <section.icon size={16} />
                {section.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        {renderContent()}
      </div>
    </div>
  );
}