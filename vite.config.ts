import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

// Universal PDF is served at opensource.unisim.co.uk/pdf in production. `base`
// controls where built assets resolve from; in local dev it stays `/`. Derived
// from Vite's `mode` so the config needs no Node `process` typings.
export default defineConfig(({ mode }) => {
  const BASE_PATH = mode === 'production' ? '/pdf/' : '/'
  return {
    base: BASE_PATH,
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version)
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: 'Universal PDF',
          short_name: 'UniPDF',
          description: 'Annotate and sign PDFs anywhere',
          theme_color: '#0f172a',
          background_color: '#f8fafc',
          display: 'standalone',
          start_url: BASE_PATH,
          scope: BASE_PATH,
          icons: [
            { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
          ]
        },
        workbox: {
          // SPA navigations under the base path fall back to the prefixed shell.
          navigateFallback: `${BASE_PATH}index.html`,
        },
        devOptions: { enabled: false }
      })
    ],
    optimizeDeps: {
      exclude: ['canvas']
    },
    worker: {
      format: 'es'
    }
  }
})
