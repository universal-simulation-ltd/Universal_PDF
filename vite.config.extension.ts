import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin, type UserConfig, type UserConfigFnObject } from 'vite'
import appConfig from './vite.config'

// The browser extension's copy of the app.
//
// ⚠️ It deliberately does NOT edit `vite.config.ts`. Nothing extension-shaped
// may reach the web, desktop or mobile bundles, and the cheapest guarantee of
// that is a separate config that the ordinary builds never load: `npm run
// build`, `build:desktop` and `build:mobile` are untouched by this file.
//
// It reuses the app config in `desktop` mode, which is already exactly what an
// extension page needs and for the same two reasons Electron and Capacitor need
// it: a relative `base` (the page is served from `chrome-extension://<id>/`, not
// from `/pdf/`) and no service worker. `desktop` mode also leaves the SDK's
// `cookieDomain` unset, so auth falls back to localStorage instead of trying to
// write a `.unisim.co.uk` cookie from an origin that can never own one, and
// points the sign-on-a-phone QR at the hosted site rather than at a
// `chrome-extension://` URL no phone can open.

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * Put `viewer-shim.js` in the page's `<head>`, ahead of the app.
 *
 * ⚠️ A CLASSIC script tag, not a module, and not inline. Classic scripts run at
 * parse time, so the shim has defined `window.launchQueue` before the app's
 * (deferred) module bundle is evaluated — which is what lets the extension
 * reuse the app's existing file-handler path with no change to `src/`. Inline
 * is not an option: an MV3 extension page's CSP is `script-src 'self'`.
 */
function viewerShim(): Plugin {
  return {
    name: 'unipdf-extension-viewer-shim',
    apply: 'build',
    transformIndexHtml: {
      order: 'post' as const,
      handler(html: string) {
        // ⚠️ The app's own inline `<script>` — the 8-second "Failed to load"
        // fallback in index.html — cannot run here at all: an MV3 extension
        // page's CSP is `script-src 'self'`, which forbids inline execution.
        // Left in, it does nothing except log a CSP violation on every single
        // page load, which is exactly the kind of permanent red herring that
        // makes a real error impossible to spot. Everything Vite emits for this
        // build carries a `src`, so this only ever matches that one block.
        return {
          html: html.replace(/[ \t]*<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>\n?/gi, ''),
          tags: [{ tag: 'script', attrs: { src: './launch-shim.js' }, injectTo: 'head-prepend' as const }]
        }
      }
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'launch-shim.js',
        source: readFileSync(resolve(HERE, 'extension/src/viewer-shim.js'), 'utf8')
      })
    }
  }
}

export default defineConfig(async (env) => {
  const base = appConfig as unknown as UserConfigFnObject
  const config = (await base({ ...env, mode: 'desktop' })) as UserConfig
  return {
    ...config,
    plugins: [...(config.plugins ?? []), viewerShim()],
    build: {
      ...config.build,
      outDir: 'extension/dist/viewer',
      emptyOutDir: true
    }
  }
})
