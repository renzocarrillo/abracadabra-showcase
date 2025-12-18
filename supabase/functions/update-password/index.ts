import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { checkHasPermission, isUserAdmin } from "../_shared/permission-helpers.ts";

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
    console.log('=== UPDATE PASSWORD FUNCTION START ===');
    console.log('Method:', req.method);
    
    // Initialize Supabase clients
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

    // We do NOT need a regular supabase client here for auth; we'll decode the JWT instead
    // to extract the user id (sub). Edge Functions already verify JWT by default.


    // Verify the user making the request is authenticated
    const authHeader = req.headers.get('Authorization');
    console.log('Auth header present:', !!authHeader);
    
    if (!authHeader) {
      console.log('No authorization header found');
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract the JWT token from the authorization header
    const jwt = authHeader.replace('Bearer ', '');
    console.log('JWT token length:', jwt.length);
    
    // Decode JWT locally to extract the user id (sub)
    const payload = jwt.split('.')[1];
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    let userId: string | undefined;
    try {
      const decodedJson = atob(padded);
      const claims = JSON.parse(decodedJson);
      userId = claims?.sub as string | undefined;
    } catch (e) {
      console.error('Failed to decode JWT:', e);
    }

    console.log('Decoded sub from JWT:', userId ? 'present' : 'missing');
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid token claims' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User authenticated successfully:', userId);

    // Check if the user has admin role or supervisor with manage_users permission
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select(`
        role,
        user_type_id,
        user_types(is_admin, name)
      `)
      .eq('id', userId)
      .maybeSingle();

    console.log('Profile query result:', { profile: !!profile, error: !!profileError });

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      return new Response(
        JSON.stringify({ error: 'Error verifying user permissions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const currentUserIsAdmin = profile?.role === 'admin' || profile?.user_types?.is_admin;
    const isSupervisor = profile?.user_types?.name === 'supervisor' || 
      await checkHasPermission(supabaseAdmin, userId, 'manage_users');
    
    console.log('Permission check:', { 
      isAdmin: currentUserIsAdmin, 
      isSupervisor,
      role: profile?.role, 
      userType: profile?.user_types?.name 
    });
    
    if (!profile || (!currentUserIsAdmin && !isSupervisor)) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions. Only admins and supervisors can update passwords.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'POST') {
      const { user_id, password } = await req.json();

      if (!user_id || !password) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: user_id, password' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // If user is supervisor (not admin), check that target user is NOT admin
      if (isSupervisor && !currentUserIsAdmin) {
        console.log('Supervisor attempting password change, checking target user...');
        const targetIsAdmin = await isUserAdmin(supabaseAdmin, user_id);
        
        console.log('Target user admin status:', targetIsAdmin);
        
        if (targetIsAdmin) {
          return new Response(
            JSON.stringify({ error: 'Supervisors cannot change passwords of admin users' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // Update the user password
      console.log(`Updating password for user: ${user_id}`);
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        password: password
      });

      if (updateError) {
        console.error('Error updating password:', updateError);
        return new Response(
          JSON.stringify({ error: updateError.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Password updated successfully for user: ${user_id}`);
      
      // Add a small delay to ensure the change is propagated
      await new Promise(resolve => setTimeout(resolve, 1000));

      return new Response(
        JSON.stringify({ 
          message: 'Password updated successfully'
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