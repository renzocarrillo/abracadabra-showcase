import { Outlet } from 'react-router-dom';
import { AppSidebar } from '@/components/AppSidebar';
import { ThemeToggle } from './ThemeToggle';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { MigrationModeBanner } from './MigrationModeBanner';
import { TopPickerBanner } from './TopPickerBanner';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export default function Layout() {
  const { data: migrationMode } = useQuery({
    queryKey: ['migration-mode'],
    queryFn: async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'migration_mode')
        .maybeSingle();
      
      if (!data?.setting_value) return false;
      const value = data.setting_value as any;
      return value.enabled === true;
    },
    refetchInterval: 5000, // Check every 5 seconds
  });

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <SidebarInset>
          {/* Top Picker Banner - Above everything */}
          <TopPickerBanner />
          
          {/* Fixed Header */}
          <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background px-3 sm:px-4 sticky top-0 z-10">
            <SidebarTrigger className="-ml-1" />
            <div className="flex flex-1 justify-center">
              <h1 className="text-lg sm:text-xl font-semibold">Abracadabra</h1>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
            </div>
          </header>
          
          {/* Migration Mode Banner */}
          {migrationMode && <MigrationModeBanner />}
          
          {/* Scrollable Main Content */}
          <main className="flex-1 overflow-auto">
            <div className="p-3 sm:p-4 lg:p-6">
              <Outlet />
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}