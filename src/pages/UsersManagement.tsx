import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import DeleteConfirmationDialog from '@/components/DeleteConfirmationDialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit, Trash2, Users, ChevronLeft, Mail, Calendar, Key, Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface UserType {
  id: string;
  name: string;
  display_name: string;
  is_admin: boolean;
}

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  user_type_id: string | null;
  deleted_at?: string;
  deleted_by_user_name?: string;
  deletion_reason?: string;
  user_types?: UserType;
}

export default function UsersManagement() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [userTypes, setUserTypes] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [targetUser, setTargetUser] = useState<UserProfile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    user_type_id: '',
    password: ''
  });
  const [passwordData, setPasswordData] = useState({
    password: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch user types (filter out admin types for supervisors)
      const { data: userTypesData, error: userTypesError } = await supabase
        .from('user_types')
        .select('*')
        .order('display_name');

      if (userTypesError) throw userTypesError;

      // Filter out admin types if user is supervisor  
      // Need to check if current user is admin to determine filtering
      const { data: currentUserType, error: currentUserError } = await supabase
        .from('user_types')
        .select('is_admin')
        .eq('id', profile?.user_type_id || '')
        .single();

      const isCurrentUserAdmin = profile?.role === 'admin' || currentUserType?.is_admin;
      
      const filteredUserTypes = userTypesData?.filter(userType => {
        if (isCurrentUserAdmin) {
          return true; // Admins can see all types
        }
        return !userType.is_admin; // Supervisors can't see admin types
      }) || [];

      // Fetch users with their types (excluding soft deleted users)
      const { data: usersData, error: usersError } = await supabase
        .from('profiles')
        .select(`
          *,
          user_types(*)
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (usersError) throw usersError;

      // Filter out admin users if current user is supervisor
      const filteredUsers = usersData?.filter(user => {
        if (isCurrentUserAdmin) {
          return true; // Admins can see all users
        }
        // Supervisors can't see admin users
        return !user.user_types?.is_admin;
      }) || [];

      setUserTypes(filteredUserTypes);
      setUsers(filteredUsers);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los usuarios",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      email: '',
      full_name: '',
      user_type_id: '',
      password: ''
    });
    setEditingUser(null);
    setShowPassword(false);
  };

  const resetPasswordForm = () => {
    setPasswordData({
      password: ''
    });
    setShowNewPassword(false);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (user: UserProfile) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      full_name: user.full_name || '',
      user_type_id: user.user_type_id || '',
      password: ''
    });
    setDialogOpen(true);
  };

  const openPasswordDialog = (user: UserProfile) => {
    setTargetUser(user);
    resetPasswordForm();
    setPasswordDialogOpen(true);
  };

  const openDeleteDialog = (user: UserProfile) => {
    setTargetUser(user);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (!formData.email.trim()) {
        toast({
          title: "Error",
          description: "El email es requerido",
          variant: "destructive"
        });
        return;
      }

      if (!formData.user_type_id) {
        toast({
          title: "Error",
          description: "Debe seleccionar un tipo de usuario",
          variant: "destructive"
        });
        return;
      }

      if (!editingUser && !formData.password.trim()) {
        toast({
          title: "Error",
          description: "La contraseña es requerida para nuevos usuarios",
          variant: "destructive"
        });
        return;
      }

      if (editingUser) {
        // Update existing user
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            full_name: formData.full_name,
            user_type_id: formData.user_type_id,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingUser.id);

        if (updateError) throw updateError;

        toast({
          title: "Éxito",
          description: "Usuario actualizado correctamente"
        });
      } else {
        // Create new user via edge function
        const { data, error: createError } = await supabase.functions.invoke('create-user', {
          body: {
            email: formData.email,
            full_name: formData.full_name,
            user_type_id: formData.user_type_id,
            password: formData.password
          }
        });

        if (createError) {
          console.error('Edge function error:', createError);
          throw createError;
        }
        
        // Check if the response contains an error message
        if (data && data.error) {
          throw new Error(data.error);
        }

        toast({
          title: "Éxito",
          description: "Usuario creado correctamente con contraseña asignada."
        });
      }

      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      console.error('Error saving user:', error);
      const description = (error as any)?.message || (typeof error === 'string' ? error : 'No se pudo guardar el usuario');
      toast({
        title: "Error",
        description,
        variant: "destructive"
      });
    }
  };

  const handlePasswordUpdate = async () => {
    console.log('handlePasswordUpdate called');
    console.log('passwordData:', passwordData);
    console.log('targetUser:', targetUser);
    
    try {
      // Perform all validations BEFORE setting loading state
      if (!passwordData.password.trim()) {
        console.log('Password validation failed: empty password');
        toast({
          title: "Error",
          description: "La contraseña es requerida",
          variant: "destructive"
        });
        return;
      }

      if (!targetUser) {
        console.log('No target user selected');
        toast({
          title: "Error",
          description: "No se ha seleccionado un usuario",
          variant: "destructive"
        });
        return;
      }

      // Ensure we send a valid session token in the request headers
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        toast({
          title: 'Error',
          description: 'No hay sesión activa. Vuelve a iniciar sesión.',
          variant: 'destructive',
        });
        return;
      }

      // All validations passed, now set loading state
      setIsUpdatingPassword(true);

      console.log('About to call update-password function');
      const { data, error } = await supabase.functions.invoke('update-password', {
        body: {
          user_id: targetUser.id,
          password: passwordData.password,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      console.log('Function response:', { data, error });

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }
      
      if (data && data.error) {
        console.error('Function returned error:', data.error);
        throw new Error(data.error);
      }

      console.log('Password updated successfully');
      toast({
        title: "Éxito",
        description: "Contraseña actualizada correctamente"
      });

      setPasswordDialogOpen(false);
      setTargetUser(null);
      resetPasswordForm();
    } catch (error) {
      console.error('Error updating password:', error);
      const description = (error as any)?.message || (typeof error === 'string' ? error : 'No se pudo actualizar la contraseña');
      toast({
        title: "Error",
        description,
        variant: "destructive"
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!targetUser) return;
    
    setIsDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: {
          user_id: targetUser.id
        }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }
      
      if (data && data.error) {
        throw new Error(data.error);
      }

      toast({
        title: "Éxito",
        description: "Usuario eliminado correctamente"
      });

      setDeleteDialogOpen(false);
      setTargetUser(null);
      fetchData();
    } catch (error) {
      console.error('Error deleting user:', error);
      const description = (error as any)?.message || (typeof error === 'string' ? error : 'No se pudo eliminar el usuario');
      toast({
        title: "Error",
        description,
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Helper function to determine if current user can modify target user
  const canModifyUser = (targetUser: UserProfile) => {
    const currentUserIsAdmin = profile?.role === 'admin' || 
      (profile?.user_type_id && userTypes.find(ut => ut.id === profile.user_type_id)?.is_admin);
    
    if (currentUserIsAdmin) return true;
    
    // If not admin, check if is supervisor with manage_users
    const hasSupervisorPermission = userTypes.find(ut => ut.id === profile?.user_type_id)?.name === 'supervisor';
    const targetIsAdmin = targetUser.user_types?.is_admin || false;
    
    return hasSupervisorPermission && !targetIsAdmin;
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ChevronLeft className="h-4 w-4" />
            Volver
          </Button>
          <h1 className="text-2xl font-bold">Gestión de Usuarios</h1>
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
              Gestión de Usuarios
            </h1>
            <p className="text-muted-foreground">Administra los usuarios del sistema y sus tipos</p>
          </div>
        </div>
        
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Nuevo Usuario
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingUser ? 'Editar Usuario' : 'Crear Nuevo Usuario'}
              </DialogTitle>
              <DialogDescription>
                {editingUser 
                  ? 'Modifica los datos del usuario'
                  : 'Crea un nuevo usuario en el sistema'
                }
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="usuario@empresa.com"
                  disabled={!!editingUser}
                />
                {editingUser && (
                  <p className="text-xs text-muted-foreground">
                    El email no se puede modificar después de crear el usuario
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="full_name">Nombre Completo</Label>
                <Input
                  id="full_name"
                  value={formData.full_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                  placeholder="Nombre y apellidos del usuario"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="user_type_id">Tipo de Usuario *</Label>
                <Select
                  value={formData.user_type_id}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, user_type_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un tipo de usuario" />
                  </SelectTrigger>
                  <SelectContent>
                    {userTypes.map((userType) => (
                      <SelectItem key={userType.id} value={userType.id}>
                        <div className="flex items-center gap-2">
                          <span>{userType.display_name}</span>
                          {userType.is_admin && (
                            <Badge variant="destructive" className="text-xs">
                              Admin
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!editingUser && (
                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña *</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="Ingresa una contraseña segura"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    La contraseña debe tener al menos 6 caracteres
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave}>
                {editingUser ? 'Actualizar' : 'Crear'} Usuario
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usuarios del Sistema</CardTitle>
          <CardDescription>
            Lista de todos los usuarios registrados en el sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Tipo de Usuario</TableHead>
                <TableHead>Fecha de Registro</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium flex items-center gap-2">
                        {user.full_name || 'Sin nombre'}
                        {user.id === profile?.id && (
                          <Badge variant="outline" className="text-xs">
                            Tú
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {user.email}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.user_types ? (
                      <Badge variant={user.user_types.is_admin ? "destructive" : "default"}>
                        {user.user_types.display_name}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Sin asignar</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(user.created_at)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {canModifyUser(user) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(user)}
                          title="Editar usuario"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                      {canModifyUser(user) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openPasswordDialog(user)}
                          title="Cambiar contraseña"
                        >
                          <Key className="h-4 w-4" />
                        </Button>
                      )}
                      {user.id !== profile?.id && canModifyUser(user) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDeleteDialog(user)}
                          title="Eliminar usuario"
                          className="text-destructive hover:text-destructive"
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

      {/* Password Update Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar Contraseña</DialogTitle>
            <DialogDescription>
              Cambia la contraseña para {targetUser?.full_name || targetUser?.email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new_password">Nueva Contraseña *</Label>
              <div className="relative">
                <Input
                  id="new_password"
                  type={showNewPassword ? "text" : "password"}
                  value={passwordData.password}
                  onChange={(e) => setPasswordData(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Ingresa la nueva contraseña"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                La contraseña debe tener al menos 6 caracteres
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handlePasswordUpdate} disabled={isUpdatingPassword}>
              {isUpdatingPassword ? 'Actualizando...' : 'Actualizar Contraseña'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteUser}
        title="¿Eliminar usuario?"
        description={`¿Estás seguro de que quieres eliminar a ${targetUser?.full_name || targetUser?.email}?`}
        isDeleting={isDeleting}
      />
    </div>
  );
}