import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.1a4e5408292648ef917cc41f1b20d434',
  appName: 'warehouse-whisperer-13',
  webDir: 'dist',
  server: {
    url: 'https://1a4e5408-2926-48ef-917c-c41f1b20d434.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
    },
  },
};

export default config;