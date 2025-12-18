import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAuth?: boolean;
  allowedRoles?: Array<'admin' | 'vendedora' | 'supervisor' | 'ejecutivo'>;
}

export default function ProtectedRoute({ 
  children, 
  requireAuth = true, 
  allowedRoles = [] 
}: ProtectedRouteProps) {
  const { user, profile, loading, canAccess } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (requireAuth && !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Cargando perfil...</p>
        </div>
      </div>
    );
  }

  // Skip old role-based checks if user has new user_type_id system
  if (profile?.user_type_id) {
    // For users with user_type_id, we rely on permission-based access control in individual pages
    // The permission system will handle access control through usePermissions hook
    return <>{children}</>;
  }

  // Fallback to old role system for users without user_type_id
  // Check role-based access
  if (allowedRoles.length > 0 && profile && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  // Check path-based access for vendedoras
  if (profile && profile.role === 'vendedora' && !canAccess(location.pathname)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}