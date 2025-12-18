import { useAuth as useAuthContext } from '@/contexts/AuthContext';

// Re-export for easier importing
export const useAuth = useAuthContext;

// Security helper to check if user has required role
export const useRoleCheck = (requiredRole: 'admin' | 'vendedora') => {
  const { profile, user } = useAuth();
  
  if (!user || !profile) {
    return { hasRole: false, isLoading: true };
  }
  
  return { 
    hasRole: profile.role === requiredRole || profile.role === 'admin', // Admin has access to everything
    isLoading: false 
  };
};

// Security helper to check if user has any of the required roles
export const useMultiRoleCheck = (requiredRoles: ('admin' | 'vendedora')[]) => {
  const { profile, user } = useAuth();
  
  if (!user || !profile) {
    return { hasRole: false, isLoading: true };
  }
  
  return { 
    hasRole: requiredRoles.includes(profile.role as any),
    isLoading: false 
  };
};