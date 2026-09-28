import type { CapacitorConfig } from '@capacitor/cli'

// Capacitor wraps the same Vite build that ships to the web and to Electron.
// `webDir` is the Vite build output. Capacitor serves it from a local
// `capacitor://` / `https://localhost` origin, so assets must resolve
// relatively — build with `npm run build:desktop` (which sets Vite `base` to
// `./`) before running `npx cap sync`, NOT the production `/pdf/` base build.
const config: CapacitorConfig = {
  appId: 'uk.co.unisim.pdf',
  appName: 'Universal PDF',
  webDir: 'dist',
  // Android 15+ lays the window out under the status bar and the camera
  // cutout (edge-to-edge is enforced from targetSdk 35, with no opt-out at 36).
  // Capacitor 8 removed `android.adjustMarginsForEdgeToEdge` in favour of its
  // core SystemBars plugin, which reads index.html's `viewport-fit=cover`: on a
  // WebView from Chromium 140 the page is drawn edge-to-edge and
  // `env(safe-area-inset-*)` carries the real insets — which this app already
  // pads by everywhere, exactly as on iOS. On an older WebView, where those env
  // values read 0, it pads the web view natively instead and the strips show
  // the WINDOW background, which values/styles.xml pins light.
  plugins: {
    SystemBars: {
      // The glyphs' colour at launch: dark, for the white landing page (see
      // `setStatusBarOverDarkChrome`, which changes it per screen). Left at
      // DEFAULT it would follow the phone's dark mode — white glyphs on white.
      style: 'LIGHT',
      // index.html says cover; saying so here spares a layout jump on start.
      initialViewportFitValueHint: 'cover',
    },
  },
}

export default config
