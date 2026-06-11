import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.wise.split',
  appName: 'Wise',
  webDir: 'dist',
  server: {
    // Allow cleartext HTTP for local dev (emulator/LAN backend).
    // In production, set androidScheme: 'https' and point to HTTPS API.
    androidScheme: 'http',
    cleartext: true,
  },
  android: {
    // Keep the WebView background dark while the web content loads
    backgroundColor: '#0A0A0F',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#0A0A0F',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0A0A0F',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'body',
      style: 'DARK',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
