import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { checkHasPermission, isUserAdmin } from '../_shared/permission-helpers.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role key for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Verify the user making the request is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get JWT token from authorization header
    const token = authHeader.replace('Bearer ', '');

    // Verify the user is authenticated using admin client
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if the user has admin or supervisor permissions
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select(`
        role,
        user_type_id,
        user_types(is_admin)
      `)
      .eq('id', user.id)
      .maybeSingle();

    // Check if the user has admin permissions (modern system or legacy role)
    const isAdmin = await isUserAdmin(supabaseAdmin, user.id);

    // Check if the user has supervisor permissions (legacy role or manage_users permission)
    const isSupervisor = profile?.role === 'supervisor' || 
      await checkHasPermission(supabaseAdmin, user.id, 'manage_users');
    
    if (!profile || (!isAdmin && !isSupervisor)) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions. Only admins and supervisors can create users.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'POST') {
      const { email, full_name, user_type_id, password } = await req.json();

      if (!email || !user_type_id || !password) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: email, user_type_id, password' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify the user type exists
      const { data: userType, error: userTypeError } = await supabaseAdmin
        .from('user_types')
        .select('*')
        .eq('id', user_type_id)
        .single();

      if (userTypeError || !userType) {
        return new Response(
          JSON.stringify({ error: 'Invalid user type' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Prevent supervisors from creating admin users
      if (isSupervisor && !isAdmin && userType.is_admin) {
        return new Response(
          JSON.stringify({ error: 'Supervisors cannot create admin users' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if there's a soft-deleted user with this email
      const { data: deletedProfile } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('email', email)
        .not('deleted_at', 'is', null)
        .maybeSingle();

      if (deletedProfile) {
        console.log('Found soft-deleted user, reactivating:', email);
        
        // Update the user's password in auth
        const { error: updatePasswordError } = await supabaseAdmin.auth.admin.updateUserById(
          deletedProfile.id,
          { password }
        );

        if (updatePasswordError) {
          console.error('Error updating password for reactivated user:', updatePasswordError);
          return new Response(
            JSON.stringify({ error: 'Failed to update password for reactivated user' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Reactivate the user profile
        const { error: reactivateError } = await supabaseAdmin
          .from('profiles')
          .update({
            full_name: full_name || deletedProfile.full_name || '',
            user_type_id,
            role: 'vendedora',
            deleted_at: null,
            deleted_by_user_id: null,
            deleted_by_user_name: null,
            deletion_reason: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', deletedProfile.id);

        if (reactivateError) {
          console.error('Error reactivating user profile:', reactivateError);
          return new Response(
            JSON.stringify({ error: 'Failed to reactivate user profile' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ 
            message: 'User reactivated successfully',
            user: {
              id: deletedProfile.id,
              email: deletedProfile.email,
              full_name: full_name || deletedProfile.full_name || '',
              user_type: userType.display_name,
              reactivated: true
            }
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create new user using admin client with password
      const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        user_metadata: {
          full_name: full_name || '',
        },
        email_confirm: true, // Auto-confirm email for admin-created users
      });

      if (createError) {
        console.error('Error creating user:', createError);
        return new Response(
          JSON.stringify({ error: createError.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!authData.user) {
        return new Response(
          JSON.stringify({ error: 'Failed to create user' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Ensure profile exists and set the specified user type
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (!existingProfile) {
        const { error: insertError } = await supabaseAdmin
          .from('profiles')
          .insert({
            id: authData.user.id,
            email: authData.user.email,
            full_name: full_name || '',
            role: 'vendedora',
            user_type_id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        if (insertError) {
          console.error('Error creating profile:', insertError);
          // Rollback: try to delete the created auth user if profile creation fails
          await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
          return new Response(
            JSON.stringify({ error: 'Failed to create user profile' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .update({ 
            user_type_id, 
            full_name: full_name || '',
            updated_at: new Date().toISOString()
          })
          .eq('id', authData.user.id);

        if (updateError) {
          console.error('Error updating profile:', updateError);
          // Try to delete the created user if profile update fails
          await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
          return new Response(
            JSON.stringify({ error: 'Failed to set user type' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      return new Response(
        JSON.stringify({ 
          message: 'User created successfully',
          user: {
            id: authData.user.id,
            email: authData.user.email,
            full_name: full_name || '',
            user_type: userType.display_name,
            reactivated: false
          }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});