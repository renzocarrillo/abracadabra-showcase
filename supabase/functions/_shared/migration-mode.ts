import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export async function isMigrationModeActive(): Promise<boolean> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)
  
  console.log('Checking migration mode...')
  
  const { data, error } = await supabase
    .from('system_settings')
    .select('setting_value')
    .eq('setting_key', 'migration_mode')
    .maybeSingle()
  
  if (error) {
    console.log('Migration mode check error:', error)
    return false
  }
  
  if (!data) {
    console.log('Migration mode setting not found, defaulting to false')
    return false
  }
  
  const enabled = data.setting_value?.enabled === true
  console.log('Migration mode enabled:', enabled)
  return enabled
}
