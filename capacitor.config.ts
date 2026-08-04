import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Per-venue: set these when wiring up a client remix.
  appId: 'com.venue.hub',
  appName: 'Venue Hub',
  webDir: 'dist',
  server: {
    // Per-venue: the published Hub domain, e.g. https://hub.example.com
    url: 'https://hub.example.com',
    cleartext: false
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  },
  android: {
    allowMixedContent: false
  }
};

export default config;
