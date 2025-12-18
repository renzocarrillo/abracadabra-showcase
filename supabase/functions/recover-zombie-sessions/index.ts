import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ZombieSession {
  session_id: string;
  status: string;
  zombie_type: string;
  minutes_inactive: number;
  last_activity_at: string;
  created_at: string;
  retry_count: number;
  last_error: string | null;
}

interface RecoveryResult {
  success: boolean;
  action?: string;
  message?: string;
  error?: string;
  session_id: string;
  requires_attention?: boolean;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[Recovery] Starting zombie session recovery process');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Step 1: Detect zombie sessions
    console.log('[Recovery] Detecting zombie sessions...');
    const { data: zombieSessions, error: detectError } = await supabase
      .rpc('detect_zombie_sessions');

    if (detectError) {
      console.error('[Recovery] Error detecting zombie sessions:', detectError);
      throw new Error(`Failed to detect zombie sessions: ${detectError.message}`);
    }

    const zombies = (zombieSessions || []) as ZombieSession[];
    console.log(`[Recovery] Found ${zombies.length} zombie session(s)`);

    if (zombies.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No zombie sessions detected',
          zombies_found: 0,
          recovered: 0,
          failed: 0,
          requires_attention: 0,
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Step 2: Get statistics before recovery
    const { data: statsBefore } = await supabase
      .rpc('get_zombie_sessions_stats');

    console.log('[Recovery] Statistics before recovery:', statsBefore);

    // Step 3: Attempt recovery for each zombie session
    const recoveryResults: RecoveryResult[] = [];
    let recoveredCount = 0;
    let failedCount = 0;
    let attentionRequiredCount = 0;

    for (const zombie of zombies) {
      console.log(`[Recovery] Processing zombie session ${zombie.session_id}:`, {
        type: zombie.zombie_type,
        status: zombie.status,
        minutes_inactive: zombie.minutes_inactive,
      });

      try {
        // Determine if force cancel based on zombie type
        const forceCancel = 
          zombie.zombie_type === 'abandoned_scanning' ||
          zombie.zombie_type === 'abandoned_verification' ||
          zombie.minutes_inactive > 180; // Force cancel after 3 hours

        const { data: result, error: recoveryError } = await supabase
          .rpc('recover_zombie_session', {
            p_session_id: zombie.session_id,
            p_force_cancel: forceCancel,
          });

        if (recoveryError) {
          console.error(`[Recovery] Error recovering session ${zombie.session_id}:`, recoveryError);
          failedCount++;
          recoveryResults.push({
            success: false,
            error: recoveryError.message,
            session_id: zombie.session_id,
          });
          continue;
        }

        const recoveryResult = result as RecoveryResult;
        recoveryResults.push(recoveryResult);

        if (recoveryResult.success) {
          recoveredCount++;
          
          if (recoveryResult.requires_attention) {
            attentionRequiredCount++;
            console.warn(`[Recovery] Session ${zombie.session_id} requires manual attention:`, 
              recoveryResult.message);
          } else {
            console.log(`[Recovery] Successfully recovered session ${zombie.session_id}:`, 
              recoveryResult.action);
          }
        } else {
          failedCount++;
          console.error(`[Recovery] Failed to recover session ${zombie.session_id}:`, 
            recoveryResult.error);
        }

      } catch (err) {
        console.error(`[Recovery] Exception processing session ${zombie.session_id}:`, err);
        failedCount++;
        recoveryResults.push({
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
          session_id: zombie.session_id,
        });
      }
    }

    // Step 4: Get statistics after recovery
    const { data: statsAfter } = await supabase
      .rpc('get_zombie_sessions_stats');

    console.log('[Recovery] Statistics after recovery:', statsAfter);

    // Step 5: Log recovery summary to audit log
    const summary = {
      total_zombies_found: zombies.length,
      recovered: recoveredCount,
      failed: failedCount,
      requires_attention: attentionRequiredCount,
      recovery_details: recoveryResults,
      stats_before: statsBefore,
      stats_after: statsAfter,
      execution_timestamp: new Date().toISOString(),
    };

    console.log('[Recovery] Recovery process completed:', summary);

    // Log to picking_libre_audit_log
    await supabase.from('picking_libre_audit_log').insert({
      event_type: 'zombie_recovery_batch',
      event_status: failedCount > 0 ? 'partial_success' : 'success',
      user_name: 'Recovery System',
      details: summary,
    });

    // Return comprehensive summary
    return new Response(
      JSON.stringify({
        success: true,
        message: `Recovery completed: ${recoveredCount} recovered, ${failedCount} failed`,
        zombies_found: zombies.length,
        recovered: recoveredCount,
        failed: failedCount,
        requires_attention: attentionRequiredCount,
        recovery_details: recoveryResults,
        stats: {
          before: statsBefore,
          after: statsAfter,
        },
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('[Recovery] Fatal error in recovery process:', error);

    // Log fatal error to audit
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    await supabase.from('picking_libre_audit_log').insert({
      event_type: 'zombie_recovery_error',
      event_status: 'error',
      user_name: 'Recovery System',
      error_message: error instanceof Error ? error.message : 'Unknown error',
      stack_trace: error instanceof Error ? error.stack : undefined,
    });

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        message: 'Recovery process failed',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
