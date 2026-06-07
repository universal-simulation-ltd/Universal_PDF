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
}

export default config
