// Dark mode before the first paint. The theme store (src/stores/themeStore.ts)
// applies the same class, but only once the module bundle has parsed, so a
// dark-mode user would see one light frame first. This only ever ADDS `dark`:
// light is the default, so there is nothing to take away. The app's key is its
// OVERRIDE (Tune this app); absent, it follows Global Tuning's
// `universal:color-scheme`.
//
// ⚠️ A file of its own, loaded as a classic script in index.html's <head>,
// rather than an inline <script>: the Content-Security-Policy (public/_headers)
// and the extension's MV3 page both refuse inline scripts. Like
// boot-fallback.js it needs its own line in _redirects.
// ⚠️ The key must match the store's; `npm run test:theme` checks it.
try {
  var pref = localStorage.getItem('unisim-pdf-theme')
    || localStorage.getItem('universal:color-scheme') || 'light'
  if (pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark')
    document.documentElement.style.colorScheme = 'dark'
  }
} catch (e) {
  /* private mode, storage disabled: light, exactly as the store falls back. */
}
