import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

/**
 * Unified permission checker that supports:
 * - Specific permission names
 * - Legacy role system (admin, vendedora, supervisor)
 * - New user_type system (is_admin flag)
 * - User type names (admin, supervisor, etc.)
 */
export async function checkUserPermission(
  supabaseClient: SupabaseClient,
  userId: string,
  options: {
    permissionName?: string;
    allowedRoles?: string[];
    allowedUserTypeNames?: string[];
  }
): Promise<boolean> {
  const { data: profile } = await supabaseClient
    .from('profiles')
    .select(`
      role,
      user_type_id,
      user_types (
        name,
        is_admin,
        user_type_permissions (
          permissions (
            name
          )
        )
      )
    `)
    .eq('id', userId)
    .maybeSingle();

  if (!profile) {
    return false;
  }

  // Check 1: Legacy role system
  if (options.allowedRoles && options.allowedRoles.includes(profile.role)) {
    return true;
  }

  // Check 2: New user type system - is_admin flag
  if (profile.user_types?.is_admin) {
    return true;
  }

  // Check 3: User type names (e.g., 'supervisor', 'admin')
  if (options.allowedUserTypeNames && profile.user_types?.name) {
    if (options.allowedUserTypeNames.includes(profile.user_types.name)) {
      return true;
    }
  }

  // Check 4: Specific permission
  if (options.permissionName && profile.user_types?.user_type_permissions) {
    const hasPermission = profile.user_types.user_type_permissions.some(
      (utp: any) => utp.permissions?.name === options.permissionName
    );
    if (hasPermission) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a user has a specific permission based on their user_type
 * @deprecated Use checkUserPermission instead
 */
export async function checkHasPermission(
  supabaseAdmin: SupabaseClient,
  userId: string,
  permissionName: string
): Promise<boolean> {
  return checkUserPermission(supabaseAdmin, userId, { permissionName });
}

/**
 * Check if a user is an admin (either by role or user_type)
 * @deprecated Use checkUserPermission instead
 */
export async function isUserAdmin(
  supabaseAdmin: SupabaseClient,
  userId: string
): Promise<boolean> {
  return checkUserPermission(supabaseAdmin, userId, { 
    allowedRoles: ['admin'],
    allowedUserTypeNames: ['admin']
  });
}
