// Universal PDF — MV3 background service worker.
//
// Two ways in, and they acquire the document by completely different routes.
// The difference is the whole design, so it is worth stating up front.
//
//   1. THE CLICK (toolbar button / right-click on a PDF page). The tab is
//      already showing the document in the browser's own viewer, so we read it
//      back from INSIDE that tab with `chrome.scripting.executeScript`. That
//      needs no host permission — `activeTab` covers it — and, measured on
//      2026-08-31, a `fetch(location.href)` in the tab is served from that
//      tab's own HTTP cache: a cacheable PDF costs ZERO extra requests, and a
//      cookie-protected one carries the page's cookies either way. Only a
//      `Cache-Control: no-store` response forces a real second GET.
//
//   2. "ALWAYS USE ON THIS SITE" (declarativeNetRequest). Here the redirect
//      happens before any tab ever renders the PDF, so there is nothing to read
//      back and the viewer page has to fetch the URL itself — a genuine second
//      GET. That is exactly why it is opt-in per origin: the one document shape
//      it cannot open (a single-use or POST-scoped URL served `no-store`) fails
//      only for someone who asked for this behaviour on this site.
//
// ⚠️ Never widen `optional_host_permissions` into `host_permissions`. Nothing
// here is granted at install; every origin arrives through a click.

const VIEWER_PAGE = 'viewer/index.html'

// Documents read out of a tab, waiting for the viewer page to claim them.
// Keyed by a short id that travels in the viewer URL. Held in memory rather
// than chrome.storage.session because that has a 10 MB quota and PDFs do not.
const pending = new Map()
let nextId = 1

// A claim normally happens within a second of the handoff. Anything still here
// after this long is a viewer that never loaded; drop it rather than hold on to
// tens of megabytes for the life of the worker.
const PENDING_TTL_MS = 5 * 60 * 1000

function stash(doc) {
  const id = String(nextId++)
  pending.set(id, { doc, at: Date.now() })
  for (const [key, entry] of pending) {
    if (Date.now() - entry.at > PENDING_TTL_MS) pending.delete(key)
  }
  return id
}

function viewerUrl(params) {
  return chrome.runtime.getURL(VIEWER_PAGE) + '?launching=1&' + params
}

// ---------------------------------------------------------------------------
// Reading the document out of the tab that is already showing it
// ---------------------------------------------------------------------------

// ⚠️ ISOLATED world, not MAIN. Both worlds work and both hit the tab's cache
// (measured), but MAIN world would run our fetch in the page's own JavaScript
// context where a hostile page could have patched `fetch` and handed us
// whatever it liked. ISOLATED gets the same cookies and the same cache with
// none of that.
async function readFromTab(tabId) {
  const [injected] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'ISOLATED',
    func: async () => {
      try {
        const res = await fetch(location.href, { credentials: 'include' })
        if (!res.ok) return { error: 'http', status: res.status }
        const buf = new Uint8Array(await res.arrayBuffer())
        // %PDF at the head — the browser may well be showing something that is
        // not a PDF at all, and a 40 MB HTML error page rendered by our viewer
        // is a worse failure than an honest message.
        const magic = String.fromCharCode(...buf.subarray(0, 5))
        if (magic !== '%PDF-') return { error: 'notpdf', contentType: res.headers.get('content-type') }
        let binary = ''
        const CHUNK = 0x8000
        for (let i = 0; i < buf.length; i += CHUNK) {
          binary += String.fromCharCode.apply(null, buf.subarray(i, i + CHUNK))
        }
        return {
          b64: btoa(binary),
          size: buf.length,
          disposition: res.headers.get('content-disposition'),
          url: location.href
        }
      } catch (err) {
        return { error: 'fetch', detail: String(err) }
      }
    }
  })
  return injected?.result ?? { error: 'noresult' }
}

// The name to show in the app. Content-Disposition first — it is the only
// source that is right for a PDF served from an extensionless URL like
// `/download?id=42`, which is precisely the case a URL-derived name gets wrong.
function fileNameFor(url, disposition) {
  const star = disposition && /filename\*=\s*UTF-8''([^;]+)/i.exec(disposition)
  if (star) {
    try {
      return ensurePdf(decodeURIComponent(star[1].trim()))
    } catch {
      /* a malformed filename* is not worth failing the open for */
    }
  }
  const plain = disposition && /filename\s*=\s*"?([^";]+)"?/i.exec(disposition)
  if (plain) return ensurePdf(plain[1].trim())
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '')
    if (last) return ensurePdf(last)
  } catch {
    /* fall through to the generic name */
  }
  return 'document.pdf'
}

function ensurePdf(name) {
  const clean = name.replace(/[\\/:*?"<>|]/g, '_').trim()
  if (!clean) return 'document.pdf'
  return /\.pdf$/i.test(clean) ? clean : `${clean}.pdf`
}

// ---------------------------------------------------------------------------
// The click path
// ---------------------------------------------------------------------------

/**
 * Read the PDF out of `tab` and replace that tab with our viewer.
 * Returns `{ ok: true }`, or `{ ok: false, reason, ... }` for the popup to
 * explain. The tab is only navigated once the bytes are actually in hand, so a
 * failure leaves the user exactly where they were.
 */
export async function openFromTab(tab) {
  if (!tab?.id || !tab.url) return { ok: false, reason: 'notab' }

  if (tab.url.startsWith('file://')) {
    const allowed = await chrome.extension?.isAllowedFileSchemeAccess?.().catch(() => true)
    // Not a guess — without the toggle the injection below fails with an
    // opaque "Cannot access contents of the page", which tells the user
    // nothing about the switch that fixes it.
    if (allowed === false) return { ok: false, reason: 'filescheme' }
  }

  let read
  try {
    read = await readFromTab(tab.id)
  } catch (err) {
    return { ok: false, reason: 'inject', detail: String(err) }
  }
  if (read.error) return { ok: false, reason: read.error, status: read.status, detail: read.detail }

  const id = stash({
    b64: read.b64,
    name: fileNameFor(read.url ?? tab.url, read.disposition),
    size: read.size
  })
  await chrome.tabs.update(tab.id, { url: viewerUrl(`id=${id}`) })
  return { ok: true, size: read.size }
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  ;(async () => {
    try {
      if (msg?.cmd === 'claim') {
        // One-shot: the viewer either uses these bytes now or reloads from
        // scratch. Keeping them would pin the whole document in the worker.
        const entry = pending.get(msg.id)
        pending.delete(msg.id)
        reply(entry ? { ok: true, ...entry.doc } : { ok: false, reason: 'expired' })
      } else if (msg?.cmd === 'openTab') {
        const tab = msg.tabId
          ? await chrome.tabs.get(msg.tabId)
          : (await chrome.tabs.query({ active: true, currentWindow: true }))[0]
        reply(await openFromTab(tab))
      } else if (msg?.cmd === 'alwaysState') {
        reply(await alwaysState(msg.origin))
      } else if (msg?.cmd === 'enableAlways') {
        reply(await enableAlways(msg.origin))
      } else if (msg?.cmd === 'disableAlways') {
        reply(await disableAlways(msg.origin))
      } else {
        reply({ ok: false, reason: 'unknown' })
      }
    } catch (err) {
      reply({ ok: false, reason: 'threw', detail: String(err) })
    }
  })()
  return true // keep the channel open for the async reply
})

// ---------------------------------------------------------------------------
// The right-click entry
// ---------------------------------------------------------------------------

// Only offered on the document itself, never on links. A link would have to be
// fetched from the extension, which needs the origin's permission, and
// `chrome.permissions.request` cannot be called from a service worker at all —
// it needs a real page and a real gesture. The popup is where that lives.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'open-in-universal-pdf',
      title: 'Open in Universal PDF',
      contexts: ['page', 'frame'],
      documentUrlPatterns: ['*://*/*', 'file:///*']
    })
  })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'open-in-universal-pdf') void openFromTab(tab)
})

// ---------------------------------------------------------------------------
// "Always use Universal PDF on this site"
// ---------------------------------------------------------------------------
//
// One dynamic declarativeNetRequest rule per origin the user has opted in on.
// There are no static rules and no rules over `<all_urls>`: a fresh install
// redirects nothing at all.

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The match pattern to ask for, for an origin.
 *
 * ⚠️ NOT the origin with `/*` on the end. A Chrome match pattern's host may not
 * carry a port, so `https://example.com:8443/*` is not a valid pattern at all
 * and `permissions.request` rejects it outright. The permission is therefore
 * host-wide by necessity — but the REDIRECT RULE below keeps the port, so an
 * opt-in on `https://example.com:8443` still only redirects that port.
 */
function permissionPattern(origin) {
  const { protocol, hostname } = new URL(origin)
  return `${protocol}//${hostname}/*`
}

/**
 * The rule for one origin.
 *
 * `responseHeaders` (Chrome 128+) is what makes this match a PDF served from an
 * extensionless URL — the common case for "download" endpoints, and the reason
 * matching `*.pdf` alone would quietly miss half the documents on a site.
 * `withResponseHeaders: false` is the fallback for an older browser.
 */
function ruleFor(id, origin, withResponseHeaders) {
  const condition = {
    regexFilter: `^${escapeRegex(origin)}/`,
    resourceTypes: ['main_frame']
  }
  if (withResponseHeaders) {
    condition.responseHeaders = [{ header: 'content-type', values: ['application/pdf*'] }]
  } else {
    // No content-type to match on, so fall back to the extension in the path.
    condition.regexFilter = `^${escapeRegex(origin)}/[^?#]*\\.pdf([?#]|$)`
  }
  return {
    id,
    priority: 1,
    action: {
      type: 'redirect',
      // ⚠️ `\0` substitutes the matched URL VERBATIM and unencoded, so the
      // value of `file=` can itself contain `&` and `#`. `file` is therefore
      // last in the query string and the viewer parses it by hand — see
      // `viewer-shim.js`. Encoding it here is not an option: DNR has no
      // encode function.
      redirect: { regexSubstitution: `${chrome.runtime.getURL(VIEWER_PAGE)}?launching=1&file=\\0` }
    },
    condition
  }
}

async function ruleIdFor(origin) {
  const { ruleIds = {} } = await chrome.storage.local.get('ruleIds')
  if (ruleIds[origin]) return { id: ruleIds[origin], ruleIds }
  const used = new Set(Object.values(ruleIds))
  let id = 1
  while (used.has(id)) id++
  return { id, ruleIds: { ...ruleIds, [origin]: id } }
}

export async function alwaysState(origin) {
  const granted = await chrome.permissions.contains({ origins: [permissionPattern(origin)] })
  const rules = await chrome.declarativeNetRequest.getDynamicRules()
  const { ruleIds = {} } = await chrome.storage.local.get('ruleIds')
  const id = ruleIds[origin]
  return { on: !!granted && !!id && rules.some((r) => r.id === id), granted }
}

/**
 * Install the rule. The caller must ALREADY have obtained the host permission —
 * `chrome.permissions.request` only works from a page with a user gesture, so
 * it lives in the popup, not here.
 */
export async function enableAlways(origin) {
  const granted = await chrome.permissions.contains({ origins: [permissionPattern(origin)] })
  if (!granted) return { ok: false, reason: 'nopermission' }
  const { id, ruleIds } = await ruleIdFor(origin)
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [id],
      addRules: [ruleFor(id, origin, true)]
    })
  } catch (err) {
    // An older Chrome rejects the whole update over the responseHeaders
    // condition. Take the narrower rule rather than nothing.
    try {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [id],
        addRules: [ruleFor(id, origin, false)]
      })
    } catch (fallbackErr) {
      return { ok: false, reason: 'dnr', detail: `${err} / ${fallbackErr}` }
    }
    await chrome.storage.local.set({ ruleIds })
    return { ok: true, matching: 'pdf-extension-only' }
  }
  await chrome.storage.local.set({ ruleIds })
  return { ok: true, matching: 'content-type' }
}

export async function disableAlways(origin) {
  const { ruleIds = {} } = await chrome.storage.local.get('ruleIds')
  const id = ruleIds[origin]
  if (id) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [id] })
    delete ruleIds[origin]
    await chrome.storage.local.set({ ruleIds })
  }
  // Hand the permission back too. Leaving a granted origin behind after the
  // user has switched the feature off would be keeping access we no longer use.
  await chrome.permissions.remove({ origins: [permissionPattern(origin)] }).catch(() => {})
  return { ok: true }
}

// A permission revoked from chrome://extensions leaves its rule redirecting
// into a viewer that can no longer fetch anything. Clean up after it.
chrome.permissions.onRemoved.addListener(async ({ origins = [] }) => {
  const { ruleIds = {} } = await chrome.storage.local.get('ruleIds')
  const lost = new Set(origins)
  for (const origin of Object.keys(ruleIds)) {
    // ⚠️ Compared through `permissionPattern`, not by string surgery on the
    // pattern: the pattern has no port and the stored origin may have one, so
    // `https://example.com:8443` would never match `https://example.com/*`.
    if (lost.has(permissionPattern(origin))) await disableAlways(origin)
  }
})
