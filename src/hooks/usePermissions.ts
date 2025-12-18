import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
  is_admin: boolean;
}

export const usePermissions = () => {
  const { user, profile } = useAuth();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [userType, setUserType] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && profile) {
      fetchUserPermissions();
    } else {
      setPermissions([]);
      setUserType(null);
      setLoading(false);
    }
  }, [user, profile?.user_type_id]); // Add user_type_id to dependencies to refresh when it changes

  const fetchUserPermissions = async () => {
    try {
      if (!profile?.user_type_id) {
        // Fallback to old role system
        setPermissions([]);
        setUserType(null);
        setLoading(false);
        return;
      }

      // Fetch user type and permissions
      const { data: userTypeData, error: userTypeError } = await supabase
        .from('user_types')
        .select(`
          *,
          user_type_permissions(
            permissions(*)
          )
        `)
        .eq('id', profile.user_type_id)
        .single();

      if (userTypeError) {
        console.error('Error fetching user type:', userTypeError);
        setLoading(false);
        return;
      }

      if (userTypeData) {
        setUserType(userTypeData);
        
        // If admin, fetch all permissions
        if (userTypeData.is_admin) {
          const { data: allPermissions, error: permissionsError } = await supabase
            .from('permissions')
            .select('*');
          
          if (!permissionsError && allPermissions) {
            setPermissions(allPermissions);
          }
        } else {
          // Get specific permissions for this user type
          const userPermissions = userTypeData.user_type_permissions
            ?.map(utp => utp.permissions)
            .filter(Boolean) || [];
          setPermissions(userPermissions);
        }
      }
    } catch (error) {
      console.error('Error fetching permissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const hasPermission = (permissionName: string): boolean => {
    // If using old role system, fallback to role check
    if (!profile?.user_type_id) {
      return profile?.role === 'admin';
    }

    // If admin, allow everything
    if (userType?.is_admin) {
      return true;
    }

    // Check specific permission
    return permissions.some(permission => permission.name === permissionName);
  };

  const hasAnyPermission = (permissionNames: string[]): boolean => {
    return permissionNames.some(permissionName => hasPermission(permissionName));
  };

  const isAdmin = (): boolean => {
    // Check both old and new system
    return profile?.role === 'admin' || userType?.is_admin || false;
  };

  return {
    permissions,
    userType,
    loading,
    hasPermission,
    hasAnyPermission,
    isAdmin
  };
};