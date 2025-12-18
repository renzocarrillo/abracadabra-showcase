import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Plus, Edit, Trash2, Users, Shield, ChevronLeft, FileSignature } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface Permission {
  id: string;
  name: string;
  display_name: string;
  description: string;
  category: string;
}

interface UserType {
  id: string;
  name: string;
  display_name: string;
  description: string;
  is_admin: boolean;
  permissions: Permission[];
}

export default function UserTypesManagement() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuth();
  const [userTypes, setUserTypes] = useState<UserType[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUserType, setEditingUserType] = useState<UserType | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    display_name: '',
    description: '',
    is_admin: false,
    selectedPermissions: [] as string[]
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch permissions
      const { data: permissionsData, error: permissionsError } = await supabase
        .from('permissions')
        .select('*')
        .order('category, display_name');

      if (permissionsError) throw permissionsError;

      // Fetch user types with their permissions
      const { data: userTypesData, error: userTypesError } = await supabase
        .from('user_types')
        .select(`
          *,
          user_type_permissions(
            permission_id,
            permissions(*)
          )
        `)
        .order('display_name');

      if (userTypesError) throw userTypesError;

      setPermissions(permissionsData || []);
      setUserTypes(
        userTypesData?.map(ut => ({
          ...ut,
          permissions: ut.user_type_permissions?.map(utp => utp.permissions).filter(Boolean) || []
        })) || []
      );
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los datos",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      display_name: '',
      description: '',
      is_admin: false,
      selectedPermissions: []
    });
    setEditingUserType(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (userType: UserType) => {
    setEditingUserType(userType);
    setFormData({
      name: userType.name,
      display_name: userType.display_name,
      description: userType.description || '',
      is_admin: userType.is_admin,
      selectedPermissions: userType.permissions.map(p => p.id)
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (!formData.display_name.trim()) {
        toast({
          title: "Error",
          description: "El nombre del tipo de usuario es requerido",
          variant: "destructive"
        });
        return;
      }

      const name = formData.name.trim() || formData.display_name.toLowerCase().replace(/\s+/g, '_');

      if (editingUserType) {
        // Update existing user type
        const { error: updateError } = await supabase
          .from('user_types')
          .update({
            name,
            display_name: formData.display_name,
            description: formData.description,
            is_admin: formData.is_admin,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingUserType.id);

        if (updateError) throw updateError;

        // Delete existing permissions
        await supabase
          .from('user_type_permissions')
          .delete()
          .eq('user_type_id', editingUserType.id);

        // Add new permissions (if not admin - admin gets all automatically)
        if (!formData.is_admin && formData.selectedPermissions.length > 0) {
          const permissionInserts = formData.selectedPermissions.map(permissionId => ({
            user_type_id: editingUserType.id,
            permission_id: permissionId
          }));

          const { error: permissionsError } = await supabase
            .from('user_type_permissions')
            .insert(permissionInserts);

          if (permissionsError) throw permissionsError;
        } else if (formData.is_admin) {
          // If it's admin, assign all permissions
          const allPermissionInserts = permissions.map(permission => ({
            user_type_id: editingUserType.id,
            permission_id: permission.id
          }));

          const { error: allPermissionsError } = await supabase
            .from('user_type_permissions')
            .insert(allPermissionInserts);

          if (allPermissionsError) throw allPermissionsError;
        }

        toast({
          title: "Éxito",
          description: "Tipo de usuario actualizado correctamente"
        });
      } else {
        // Create new user type
        const { data: newUserType, error: createError } = await supabase
          .from('user_types')
          .insert({
            name,
            display_name: formData.display_name,
            description: formData.description,
            is_admin: formData.is_admin
          })
          .select()
          .single();

        if (createError) throw createError;

        // Add permissions (if not admin - admin gets all automatically)
        if (!formData.is_admin && formData.selectedPermissions.length > 0) {
          const permissionInserts = formData.selectedPermissions.map(permissionId => ({
            user_type_id: newUserType.id,
            permission_id: permissionId
          }));

          const { error: permissionsError } = await supabase
            .from('user_type_permissions')
            .insert(permissionInserts);

          if (permissionsError) throw permissionsError;
        } else if (formData.is_admin) {
          // If it's admin, assign all permissions
          const allPermissionInserts = permissions.map(permission => ({
            user_type_id: newUserType.id,
            permission_id: permission.id
          }));

          const { error: allPermissionsError } = await supabase
            .from('user_type_permissions')
            .insert(allPermissionInserts);

          if (allPermissionsError) throw allPermissionsError;
        }

        toast({
          title: "Éxito",
          description: "Tipo de usuario creado correctamente"
        });
      }

      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      console.error('Error saving user type:', error);
      toast({
        title: "Error",
        description: "No se pudo guardar el tipo de usuario",
        variant: "destructive"
      });
    }
  };

  const handleDelete = async (userType: UserType) => {
    if (userType.name === 'admin') {
      toast({
        title: "Error",
        description: "No se puede eliminar el tipo de usuario Administrador",
        variant: "destructive"
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('user_types')
        .delete()
        .eq('id', userType.id);

      if (error) throw error;

      toast({
        title: "Éxito",
        description: "Tipo de usuario eliminado correctamente"
      });
      fetchData();
    } catch (error) {
      console.error('Error deleting user type:', error);
      toast({
        title: "Error",
        description: "No se pudo eliminar el tipo de usuario",
        variant: "destructive"
      });
    }
  };

  const groupedPermissions = permissions.reduce((acc, permission) => {
    if (!acc[permission.category]) {
      acc[permission.category] = [];
    }
    acc[permission.category].push(permission);
    return acc;
  }, {} as Record<string, Permission[]>);

  // Enhanced category display with icons and descriptions
  // Categories are ordered by operational workflow
  const categoryDisplayNames: Record<string, { name: string; icon: string; description: string; order: number }> = {
    dashboard: {
      name: '📊 Panel de Control',
      icon: '📊',
      description: 'Acceso a métricas, estadísticas y visualización de datos del sistema',
      order: 1
    },
    orders: {
      name: '📦 Gestión de Pedidos',
      icon: '📦',
      description: 'Crear, modificar y gestionar pedidos de tiendas físicas',
      order: 2
    },
    sales: {
      name: '💰 Ventas y Transacciones',
      icon: '💰',
      description: 'Registro, preparación y emisión de ventas directas',
      order: 3
    },
    picking: {
      name: '🎯 Operaciones de Picking',
      icon: '🎯',
      description: 'Recolección y preparación de productos para pedidos y ventas',
      order: 4
    },
    signatures: {
      name: '✍️ Firmas Digitales',
      icon: '✍️',
      description: 'Validación y firma digital de documentos preparados (requiere PIN personal)',
      order: 5
    },
    inventory: {
      name: '📋 Control de Inventario',
      icon: '📋',
      description: 'Conteos físicos, auditorías y reconciliaciones de inventario',
      order: 6
    },
    stock: {
      name: '📦 Gestión de Stock',
      icon: '📦',
      description: 'Movimientos de entrada, salida y transferencias de stock',
      order: 7
    },
    bins: {
      name: '📍 Ubicaciones y Bins',
      icon: '📍',
      description: 'Gestión de ubicaciones físicas en el almacén',
      order: 8
    },
    products: {
      name: '🏷️ Administración de Productos',
      icon: '🏷️',
      description: 'Congelamiento y gestión de productos',
      order: 9
    },
    stores: {
      name: '🏪 Tiendas Físicas',
      icon: '🏪',
      description: 'Configuración y pedidos de sucursales',
      order: 10
    },
    transfers: {
      name: '🚚 Traslados y Transferencias',
      icon: '🚚',
      description: 'Movimientos entre ubicaciones, picking libre y traslados internos',
      order: 11
    },
    documents: {
      name: '📄 Documentos Tributarios',
      icon: '📄',
      description: 'Emisión de boletas, facturas y guías de remisión',
      order: 12
    },
    reports: {
      name: '📈 Reportes y Análisis',
      icon: '📈',
      description: 'Generación y visualización de reportes del sistema',
      order: 13
    },
    integrations: {
      name: '🔌 Integraciones Externas',
      icon: '🔌',
      description: 'Conexiones con Shopify, BSale y otros sistemas',
      order: 14
    },
    admin: {
      name: '👥 Administración de Sistema',
      icon: '👥',
      description: 'Gestión de usuarios, permisos y configuraciones',
      order: 15
    },
    system: {
      name: '⚙️ Configuración del Sistema',
      icon: '⚙️',
      description: 'Ajustes avanzados y modo migración',
      order: 16
    }
  };

  // Sort categories by order
  const sortedCategories = Object.entries(groupedPermissions).sort((a, b) => {
    const orderA = categoryDisplayNames[a[0]]?.order ?? 999;
    const orderB = categoryDisplayNames[b[0]]?.order ?? 999;
    return orderA - orderB;
  });

  // Permission level indicators
  const getPermissionLevel = (permissionName: string): { level: string; color: string } => {
    if (permissionName.includes('view_') || permissionName.includes('read_')) {
      return { level: '👁️ Lectura', color: 'bg-blue-500/10 text-blue-700 dark:text-blue-400' };
    }
    if (permissionName.includes('create_') || permissionName.includes('add_')) {
      return { level: '➕ Crear', color: 'bg-green-500/10 text-green-700 dark:text-green-400' };
    }
    if (permissionName.includes('edit_') || permissionName.includes('update_') || permissionName.includes('change_')) {
      return { level: '✏️ Editar', color: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400' };
    }
    if (permissionName.includes('delete_') || permissionName.includes('remove_')) {
      return { level: '🗑️ Eliminar', color: 'bg-red-500/10 text-red-700 dark:text-red-400' };
    }
    if (permissionName.includes('manage_') || permissionName.includes('admin_')) {
      return { level: '🔧 Gestión Completa', color: 'bg-purple-500/10 text-purple-700 dark:text-purple-400' };
    }
    if (permissionName.includes('sign_')) {
      return { level: '✍️ Firma Digital', color: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400' };
    }
    if (permissionName.includes('emit_')) {
      return { level: '📤 Emitir', color: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400' };
    }
    return { level: '⚡ Acción', color: 'bg-gray-500/10 text-gray-700 dark:text-gray-400' };
  };

  // Highlight signature-related permissions
  const signaturePermissions = ['sign_orders', 'sign_sales', 'view_orders_signatures', 'view_sales_signatures'];
  
  // Function to check if a permission is signature-related
  const isSignaturePermission = (permissionName: string) => signaturePermissions.includes(permissionName);

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ChevronLeft className="h-4 w-4" />
            Volver
          </Button>
          <h1 className="text-2xl font-bold">Gestión de Tipos de Usuario</h1>
        </div>
        <div className="text-center text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ChevronLeft className="h-4 w-4" />
            Volver
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6" />
              Gestión de Tipos de Usuario
            </h1>
            <p className="text-muted-foreground">Configura los tipos de usuario y sus permisos</p>
          </div>
        </div>
        
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Nuevo Tipo de Usuario
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingUserType ? 'Editar Tipo de Usuario' : 'Crear Nuevo Tipo de Usuario'}
              </DialogTitle>
              <DialogDescription>
                {editingUserType 
                  ? 'Modifica los datos y permisos del tipo de usuario'
                  : 'Define un nuevo tipo de usuario y asigna sus permisos'
                }
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="display_name">Nombre del Tipo de Usuario *</Label>
                  <Input
                    id="display_name"
                    value={formData.display_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
                    placeholder="ej. Supervisor de Ventas"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Código interno (opcional)</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Se genera automáticamente si se deja vacío"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe las responsabilidades de este tipo de usuario"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_admin"
                  checked={formData.is_admin}
                  onCheckedChange={(checked) => {
                    const isAdmin = checked as boolean;
                    setFormData(prev => ({ 
                      ...prev, 
                      is_admin: isAdmin,
                      selectedPermissions: isAdmin ? permissions.map(p => p.id) : []
                    }));
                  }}
                />
                <Label htmlFor="is_admin" className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Tipo Administrador (acceso completo)
                </Label>
              </div>

              {/* Signature Permissions Info */}
              {(formData.is_admin || formData.selectedPermissions.some(id => {
                const permission = permissions.find(p => p.id === id);
                return permission && isSignaturePermission(permission.name);
              })) && (
                <Card className="border-primary/50 bg-primary/5">
                  <CardContent className="pt-6">
                    <div className="flex gap-3">
                      <FileSignature className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm flex items-center gap-2">
                          Firmas Digitales Habilitadas
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          Los usuarios con este tipo de usuario podrán firmar digitalmente pedidos y ventas completados. 
                          <strong className="text-foreground"> Cada usuario deberá configurar su PIN de firma de 4 dígitos</strong> desde 
                          la sección de Configuración para poder utilizar esta funcionalidad.
                        </p>
                        <div className="text-xs text-muted-foreground bg-background/50 p-2 rounded border">
                          ℹ️ El PIN de firma es personal e intransferible. Se utiliza para validar la identidad del usuario 
                          al momento de firmar documentos preparados.
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {!formData.is_admin && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      <Label className="text-lg font-semibold">Permisos Específicos</Label>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {formData.selectedPermissions.length} de {permissions.length} seleccionados
                    </Badge>
                  </div>
                  
                  <p className="text-sm text-muted-foreground mb-4">
                    Selecciona los permisos específicos que tendrá este tipo de usuario. Cada permiso controla el acceso a funcionalidades particulares del sistema.
                  </p>
                  
                  {sortedCategories.map(([category, categoryPermissions]) => {
                    const categoryInfo = categoryDisplayNames[category];
                    const selectedInCategory = categoryPermissions.filter(p => 
                      formData.selectedPermissions.includes(p.id)
                    ).length;
                    
                    return (
                      <Card 
                        key={category} 
                        className={`
                          transition-all
                          ${category === 'signatures' ? 'border-primary/50 bg-primary/5' : ''}
                          ${selectedInCategory > 0 ? 'border-primary/30' : ''}
                        `}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1 flex-1">
                              <CardTitle className="text-base flex items-center gap-2">
                                <span>{categoryInfo?.name || category}</span>
                                {category === 'signatures' && (
                                  <Badge variant="default" className="text-xs">
                                    <FileSignature className="h-3 w-3 mr-1" />
                                    Requiere PIN
                                  </Badge>
                                )}
                              </CardTitle>
                              {categoryInfo?.description && (
                                <CardDescription className="text-xs">
                                  {categoryInfo.description}
                                </CardDescription>
                              )}
                            </div>
                            <Badge variant={selectedInCategory > 0 ? "default" : "secondary"} className="text-xs ml-2">
                              {selectedInCategory}/{categoryPermissions.length}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="space-y-3">
                            {categoryPermissions.map((permission) => {
                              const levelInfo = getPermissionLevel(permission.name);
                              return (
                                <div 
                                  key={permission.id} 
                                  className={`
                                    flex items-start space-x-3 p-3 rounded-lg border transition-all
                                    ${formData.selectedPermissions.includes(permission.id) 
                                      ? 'bg-primary/5 border-primary/30' 
                                      : 'bg-background border-border hover:bg-accent/50'
                                    }
                                  `}
                                >
                                  <Checkbox
                                    id={permission.id}
                                    checked={formData.selectedPermissions.includes(permission.id)}
                                    onCheckedChange={(checked) => {
                                      setFormData(prev => ({
                                        ...prev,
                                        selectedPermissions: checked
                                          ? [...prev.selectedPermissions, permission.id]
                                          : prev.selectedPermissions.filter(id => id !== permission.id)
                                      }));
                                    }}
                                    className="mt-1"
                                  />
                                  <div className="grid gap-2 flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                      <Label 
                                        htmlFor={permission.id} 
                                        className={`
                                          text-sm font-medium leading-none cursor-pointer flex items-center gap-2
                                          ${isSignaturePermission(permission.name) ? 'text-primary' : ''}
                                        `}
                                      >
                                        {permission.display_name}
                                        {isSignaturePermission(permission.name) && (
                                          <FileSignature className="h-3 w-3 flex-shrink-0" />
                                        )}
                                      </Label>
                                      <Badge 
                                        variant="outline" 
                                        className={`text-xs flex-shrink-0 ${levelInfo.color}`}
                                      >
                                        {levelInfo.level}
                                      </Badge>
                                    </div>
                                    {permission.description && (
                                      <p className="text-xs text-muted-foreground leading-relaxed">
                                        {permission.description}
                                      </p>
                                    )}
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <code className="px-2 py-0.5 bg-muted rounded text-xs font-mono">
                                        {permission.name}
                                      </code>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave}>
                {editingUserType ? 'Actualizar' : 'Crear'} Tipo de Usuario
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tipos de Usuario Configurados</CardTitle>
          <CardDescription>
            Lista de todos los tipos de usuario y sus permisos asignados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo de Usuario</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Permisos</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {userTypes.map((userType) => (
                <TableRow key={userType.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium">{userType.display_name}</div>
                      <div className="text-sm text-muted-foreground">
                        Código: {userType.name}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-xs">
                      {userType.description || 'Sin descripción'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2 max-w-md">
                      {userType.is_admin ? (
                        <>
                          <Badge variant="destructive" className="mb-1">
                            <Shield className="h-3 w-3 mr-1" />
                            Acceso Total al Sistema
                          </Badge>
                          <p className="text-xs text-muted-foreground">
                            Tiene todos los permisos disponibles, incluyendo firmas digitales.
                          </p>
                        </>
                      ) : (
                        <>
                          {/* Signature badge */}
                          {userType.permissions.some(p => isSignaturePermission(p.name)) && (
                            <Badge variant="default" className="bg-primary mb-1">
                              <FileSignature className="h-3 w-3 mr-1" />
                              Firmas Digitales Habilitadas
                            </Badge>
                          )}
                          
                          {/* Group permissions by category */}
                          <div className="space-y-1.5">
                            {Object.entries(
                              userType.permissions
                                .filter(p => !isSignaturePermission(p.name))
                                .reduce((acc, permission) => {
                                  const category = permission.category;
                                  if (!acc[category]) acc[category] = [];
                                  acc[category].push(permission);
                                  return acc;
                                }, {} as Record<string, typeof userType.permissions>)
                            )
                            .slice(0, 4) // Show first 4 categories
                            .map(([category, perms]) => {
                              const categoryInfo = categoryDisplayNames[category];
                              return (
                                <div key={category} className="flex items-center gap-1.5">
                                  <span className="text-xs">{categoryInfo?.icon || '•'}</span>
                                  <span className="text-xs font-medium">{perms.length}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {categoryInfo?.name?.replace(/^[^\s]+\s/, '') || category}
                                  </span>
                                </div>
                              );
                            })}
                            
                            {Object.keys(
                              userType.permissions
                                .filter(p => !isSignaturePermission(p.name))
                                .reduce((acc, permission) => {
                                  acc[permission.category] = true;
                                  return acc;
                                }, {} as Record<string, boolean>)
                            ).length > 4 && (
                              <div className="text-xs text-muted-foreground italic">
                                +{Object.keys(
                                  userType.permissions.reduce((acc, permission) => {
                                    acc[permission.category] = true;
                                    return acc;
                                  }, {} as Record<string, boolean>)
                                ).length - 4} categorías más
                              </div>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-1 mt-2">
                            <Badge variant="outline" className="text-xs">
                              Total: {userType.permissions.length} permisos
                            </Badge>
                          </div>
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={userType.is_admin ? "destructive" : "default"}>
                      {userType.is_admin ? "Administrador" : "Usuario"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(userType)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {userType.name !== 'admin' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(userType)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}