// The toolbar popup. Two controls: open this document once, and opt this whole
// origin in.
//
// ⚠️ This file exists as a PAGE rather than as an `action.onClicked` handler for
// one concrete reason: `chrome.permissions.request` may only be called from a
// page, during a user gesture. A service worker cannot call it at all. The
// per-origin grant behind "always use on this site" therefore has to be
// requested from a click in here.

const $ = (id) => document.getElementById(id)
const send = (msg) => chrome.runtime.sendMessage(msg)

// ⚠️ A match pattern's host may not carry a port, so this cannot be
// `${origin}/*` — see the note on the same function in background.js.
function permissionPattern(origin) {
  const { protocol, hostname } = new URL(origin)
  return `${protocol}//${hostname}/*`
}


function setStatus(text) {
  $('status').textContent = text ?? ''
}

// What the popup can say about a failure, in the user's terms. Each of these
// is a shape that was actually reproduced against a test server, not a guess.
const REASONS = {
  filescheme:
    'For PDFs on your own computer, switch on "Allow access to file URLs" for Universal PDF in chrome://extensions.',
  notpdf: 'This page is not a PDF, so there is nothing to open.',
  http: 'The browser would not hand the document over a second time (see the status code above). This usually means a one-time or expiring link.',
  fetch: 'Could not re-read the document from this page.',
  inject: 'Chrome would not let the extension read this page.',
  notab: 'No page to read.',
  expired: 'The document handover expired. Try again.'
}

// ⚠️ TEST SEAM. As a real popup this page is opened for whatever tab is in
// front, and `?tab=` is never present. The e2e cannot click a browser toolbar
// button, so it opens this page as an ordinary tab and names the tab it means —
// at which point "the active tab" would be the popup itself. The seam is safe
// to ship: `popup.html` is not a web-accessible resource, so no website can
// navigate to it, and pointing it at a tab is something the user could do by
// clicking the button anyway.
async function currentTab() {
  const forced = new URLSearchParams(window.location.search).get('tab')
  if (forced) return chrome.tabs.get(Number(forced))
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

async function main() {
  document.getElementById('manage').addEventListener('click', (event) => {
    event.preventDefault()
    chrome.runtime.openOptionsPage()
  })

  const tab = await currentTab()
  $('url').textContent = tab?.url ?? ''

  const canOpen = !!tab?.url && /^(https?|file):/.test(tab.url)
  $('open').disabled = !canOpen
  if (!canOpen) {
    setStatus('Open a PDF in a tab, then click here.')
    return
  }

  $('open').addEventListener('click', async () => {
    $('open').disabled = true
    $('open').textContent = 'Opening…'
    const res = await send({ cmd: 'openTab', tabId: tab.id })
    if (res?.ok) {
      window.close()
      return
    }
    $('open').disabled = false
    $('open').textContent = 'Open in Universal PDF'
    const status = res?.status ? ` (HTTP ${res.status})` : ''
    setStatus((REASONS[res?.reason] ?? 'Could not open this document.') + status)
  })

  // file:// has no origin to grant, and DNR cannot redirect it either.
  if (tab.url.startsWith('file://')) return

  const origin = new URL(tab.url).origin
  $('host').textContent = new URL(tab.url).host
  $('always-row').hidden = false

  const state = await send({ cmd: 'alwaysState', origin })
  $('always').checked = !!state?.on

  $('always').addEventListener('change', async (event) => {
    const wanted = event.target.checked
    $('always-note').hidden = true
    setStatus('')
    if (!wanted) {
      await send({ cmd: 'disableAlways', origin })
      return
    }
    // The gesture that carries this call is the click on the checkbox itself.
    const granted = await chrome.permissions.request({ origins: [permissionPattern(origin)] })
    if (!granted) {
      event.target.checked = false
      setStatus('Not enabled — Universal PDF needs permission for this site to do that.')
      return
    }
    const res = await send({ cmd: 'enableAlways', origin })
    if (!res?.ok) {
      event.target.checked = false
      setStatus('Could not switch that on.')
      return
    }
    $('always-note').hidden = false
    $('always-note').textContent =
      res.matching === 'content-type'
        ? 'PDFs on this site now open here. They are downloaded a second time, so a one-time link may not open — click the button above instead when that happens.'
        : 'This browser can only match PDFs by their .pdf address, so documents at other addresses will still open in the browser viewer. The button above always works.'
  })
}

void main()
