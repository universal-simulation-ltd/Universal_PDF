// If the JS bundle fails to load or throws before React mounts, #root stays
// empty. After 8s show a fallback instead of a blank page.
//
// ⚠️ A file of its own (served from public/, with its own line in _redirects)
// rather than an inline <script> in index.html: the Content-Security-Policy in
// public/_headers allows scripts from this origin only, and an inline script —
// or an inline onclick — would be refused, leaving exactly the blank page this
// exists to replace.
setTimeout(function () {
  var root = document.getElementById('root')
  if (!root || root.firstChild) return
  root.innerHTML =
    '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#f1f5f9">' +
    '<div style="background:#fff;border-radius:1rem;box-shadow:0 4px 24px #0001;padding:2.5rem;max-width:480px;width:100%;text-align:center">' +
    '<div style="font-size:2.5rem">⚠️</div>' +
    '<h2 style="margin:.75rem 0 .5rem;font-size:1.2rem;color:#0f172a">Failed to load</h2>' +
    '<p style="color:#64748b;font-size:.9rem;margin:0 0 1.5rem">Universal PDF could not start. This is likely a temporary issue.</p>' +
    '<button type="button" id="boot-reload" style="padding:.6rem 1.5rem;background:#ea580c;color:#fff;border:none;border-radius:.5rem;font-size:.9rem;font-weight:600;cursor:pointer">Reload page</button>' +
    '</div></div>'
  var button = document.getElementById('boot-reload')
  if (button) button.addEventListener('click', function () { location.reload() })
}, 8000)
