// Extension-only. Injected into the head of the packaged copy of Universal PDF,
// as a CLASSIC script so that it runs to completion before the app's module
// bundle is evaluated.
//
// It does exactly one thing: hand the app its document through the SAME
// interface the installed PWA already uses. `src/App.tsx` reads
// `window.launchQueue` and holds its loading state until a consumer fires — the
// path written for Chromium's file handler — so the extension needs no app
// code of its own and nothing extension-shaped reaches the web bundle.
//
// Two ways a document arrives:
//
//   ?id=N     the background worker already read the bytes out of the tab that
//             was showing the PDF. Nothing is fetched here.
//   ?file=URL a `declarativeNetRequest` redirect from "always use on this
//             site". The page must fetch the document itself, which is a real
//             second request — see README.
;(function () {
  'use strict'

  // ⚠️ `file` is NOT read with URLSearchParams. The DNR rule substitutes the
  // matched URL verbatim and unencoded (`\0`), so a PDF address containing `&`
  // or `#` would be truncated at the first one. The rule always puts `file=`
  // last, so everything after it is the URL.
  function readFileParam() {
    const marker = '&file='
    const at = window.location.search.indexOf(marker)
    return at === -1 ? null : window.location.search.slice(at + marker.length) + window.location.hash
  }

  const params = new URLSearchParams(window.location.search)
  const handoffId = params.get('id')
  const fileUrl = readFileParam()

  let deliver
  const arriving = new Promise((resolve) => {
    deliver = resolve
  })

  // The shape `App.tsx` expects from Chromium's launch queue: a consumer called
  // with `{ files: [handle] }`, or with no files at all — which is how the app
  // is told to stop waiting and show its landing page.
  //
  // ⚠️ `defineProperty`, NOT `window.launchQueue = …`. Chromium defines
  // `launchQueue` on the Window as an accessor with no setter, so the plain
  // assignment throws "Cannot set property launchQueue of #<Window> which has
  // only a getter" — before the app boots, and silently as far as the user is
  // concerned: every document would land on the landing page instead.
  Object.defineProperty(window, 'launchQueue', {
    configurable: true,
    value: {
      setConsumer(consumer) {
        arriving.then((file) => consumer({ files: file ? [file] : [] }))
      }
    }
  })

  function base64ToBytes(b64) {
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  }

  function fileHandle(bytes, name) {
    const file = new File([bytes], name, { type: 'application/pdf' })
    return { getFile: () => Promise.resolve(file) }
  }

  function nameFromUrl(url) {
    try {
      const last = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '')
      if (last) return /\.pdf$/i.test(last) ? last : last + '.pdf'
    } catch (err) {
      void err
    }
    return 'document.pdf'
  }

  // A failure has to be said out loud. The app itself would simply show its
  // landing page, which reads as "nothing happened" when the user asked for a
  // specific document.
  function explain(message) {
    const show = () => {
      const bar = document.createElement('div')
      bar.setAttribute('role', 'alert')
      bar.style.cssText =
        'position:fixed;z-index:2147483647;left:50%;transform:translateX(-50%);top:12px;max-width:min(560px,92vw);' +
        'background:#fef3c7;color:#78350f;border:1px solid #fcd34d;border-radius:10px;padding:12px 40px 12px 14px;' +
        'font:13px/1.5 system-ui,-apple-system,sans-serif;box-shadow:0 8px 24px #0002'
      bar.textContent = message
      const close = document.createElement('button')
      close.textContent = '×'
      close.setAttribute('aria-label', 'Dismiss')
      close.style.cssText =
        'position:absolute;top:6px;right:8px;border:0;background:none;font-size:18px;line-height:1;' +
        'color:inherit;cursor:pointer;padding:2px 6px'
      close.addEventListener('click', () => bar.remove())
      bar.appendChild(close)
      document.body.appendChild(bar)
    }
    if (document.body) show()
    else document.addEventListener('DOMContentLoaded', show)
  }

  async function claimHandoff(id) {
    const res = await chrome.runtime.sendMessage({ cmd: 'claim', id })
    if (!res || !res.ok) throw new Error('handoff-expired')
    return fileHandle(base64ToBytes(res.b64), res.name)
  }

  async function fetchDocument(url) {
    // `credentials: 'include'` is the point of this line: measured on
    // 2026-08-31, it carries the site's cookies, so a PDF behind a normal login
    // opens. What it cannot rescue is a single-use or expiring URL — this is a
    // second request and the first one already spent it.
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) {
      const err = new Error('http-' + res.status)
      err.status = res.status
      throw err
    }
    const bytes = new Uint8Array(await res.arrayBuffer())
    return fileHandle(bytes, nameFromUrl(url))
  }

  ;(async () => {
    try {
      if (handoffId) {
        deliver(await claimHandoff(handoffId))
      } else if (fileUrl) {
        deliver(await fetchDocument(fileUrl))
      } else {
        // Opened directly — the app's ordinary front door.
        deliver(null)
      }
    } catch (err) {
      deliver(null)
      if (err && err.message === 'handoff-expired') {
        explain('That document was not handed over in time. Go back to the tab it was in and click Universal PDF again.')
      } else if (err && err.status) {
        explain(
          `The site answered ${err.status} when Universal PDF asked for this document again. ` +
            'Links that only work once — one-time downloads, or a file behind a form you submitted — ' +
            'cannot be reopened this way. Open it in the browser and use the Universal PDF button instead.'
        )
      } else {
        explain('Universal PDF could not fetch this document. ' + (err && err.message ? err.message : ''))
      }
    }
  })()
})()
