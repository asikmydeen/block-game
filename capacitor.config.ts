import type { CapacitorConfig } from '@capacitor/cli';

// Capacitor packaging config (task 13.2 / 13.3).
//
// This is the single source of truth for how the shared web bundle is wrapped
// into the iOS and Android apps. Key invariants (asserted by
// `scripts/native/validate-projects.mjs`):
//
//   - `appId` / `appName` are fixed and match the store identity.
//   - `webDir` is the bundled web output (`dist/public`) — the app loads its
//     own bundled assets from a localhost origin, NOT a remote server.
//   - There is deliberately NO `server.url`: a production build must never point
//     the webview at an off-device origin. The REST/WS backend is reached
//     through the compiled-in `VITE_API_BASE_URL` / `VITE_WEBSOCKET_URL`
//     endpoints, not by loading the app shell remotely.
//   - The splash screen does NOT auto-hide; the app dismisses it exactly once
//     after React readiness and one settled viewport frame (see nativeShell.ts).
//
// OS floors, orientation, and Android soft-input behavior that Capacitor cannot
// express here (deployment target, minSdk, adjustResize, landscape lock) are
// recorded in `validation/mobile/native-config.json` and applied to the
// generated native projects; the validator reads that metadata.
const config: CapacitorConfig = {
  appId: 'com.asikmydeen.craftworld',
  appName: 'Craftworld',
  webDir: 'dist/public',
  server: {
    // Serve the bundled app from a localhost origin on both platforms; never a
    // remote production URL.
    androidScheme: 'https',
    iosScheme: 'capacitor',
    hostname: 'localhost',
  },
  plugins: {
    SplashScreen: {
      // Manual hide: the app calls SplashScreen.hide() after readiness.
      launchAutoHide: false,
      backgroundColor: '#1e401e',
      showSpinner: false,
    },
  },
};

export default config;
