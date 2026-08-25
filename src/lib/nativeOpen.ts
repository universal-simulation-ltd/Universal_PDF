// PDFs handed to the app by iOS or Android — "Open In" from the share sheet,
// or a tap on a PDF where Universal PDF was picked from the chooser.
//
// ⚠️ Neither platform lets an app MAKE ITSELF the default for a file type:
// there is no API for it on either, so nothing here can offer the one-tap
// switch the desktop build does. The user can still choose one. Registering as
// a handler (ios/App/App/Info.plist, android/.../AndroidManifest.xml) puts the
// app in the list; from there Android's own "Always", and on iOS 26 the Files
// app's "Open With" menu — which marks one handler as the default — are what
// make the choice stick. Before iOS 26 there was no per-type default at all,
// only the share sheet, one document at a time.
//
// Everything here is dynamically imported so the Capacitor plugins never reach
// the web bundle, which has its own path (the File Handling API) and would
// otherwise pay for code that can only no-op in a browser.

// `Uint8Array<ArrayBuffer>` rather than a bare `Uint8Array`: a File part may
// not be backed by a SharedArrayBuffer, and the default is the looser
// `ArrayBufferLike`.
type OpenedFile = { name: string; bytes: Uint8Array<ArrayBuffer> }

function bytesFromBase64(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * True inside a Capacitor WebView. Reads the global the native runtime injects
 * rather than importing `@capacitor/core`, so it can be answered synchronously
 * during the first render — which is what lets the app hold its loading state
 * instead of flashing the landing page on the way to a document.
 */
export function isNativeShell(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  try {
    return cap?.isNativePlatform?.() === true
  } catch {
    return false
  }
}

// The OS hands over a URL, not a file. iOS copies the document into the app's
// Inbox and passes a `file://` path; Android passes a `content://` URI that
// only the native side can resolve.
function looksOpenable(url: string): boolean {
  return url.startsWith('file://') || url.startsWith('content://')
}

// A `content://` URI carries no filename, so this is a best effort — and the
// name only ever labels the tab and seeds the export name, so a generic one is
// a cosmetic loss rather than a broken open.
function nameFromUrl(url: string): string {
  try {
    const last = decodeURIComponent(url.split('?')[0].split('/').pop() || '')
    return /\.pdf$/i.test(last) ? last : 'document.pdf'
  } catch {
    return 'document.pdf'
  }
}

async function readUrl(url: string): Promise<OpenedFile | null> {
  const { Filesystem } = await import('@capacitor/filesystem')
  // No `directory`: a full file:// path or an Android content:// URI is read
  // as given. Native returns base64; the web implementation returns a Blob,
  // which cannot happen here but costs one branch to survive.
  const { data } = await Filesystem.readFile({ path: url })
  const bytes =
    typeof data === 'string' ? bytesFromBase64(data) : new Uint8Array(await data.arrayBuffer())
  return { name: nameFromUrl(url), bytes }
}

/**
 * Subscribes to PDFs opened through the OS on iOS/Android.
 *
 * `onFile` fires for the launch document and for any opened while the app is
 * already running. `onNone` fires once when nothing is coming — off a native
 * platform entirely, or launched normally — so a caller holding a placeholder
 * knows to stop.
 *
 * Resolves to an unsubscribe function.
 */
export async function subscribeNativeOpenPdf(
  onFile: (file: File) => void,
  onNone: () => void
): Promise<() => void> {
  if (!isNativeShell()) {
    onNone()
    return () => {}
  }

  const { App } = await import('@capacitor/app')
  let cancelled = false

  const deliver = async (url: string) => {
    if (cancelled || !looksOpenable(url)) return false
    try {
      const opened = await readUrl(url)
      if (!opened || cancelled) return false
      onFile(new File([opened.bytes], opened.name, { type: 'application/pdf' }))
      return true
    } catch (err) {
      console.error('Failed to read the file the OS handed over:', err)
      return false
    }
  }

  // Opened while already running: Android delivers a new intent, iOS a new URL.
  const listener = await App.addListener('appUrlOpen', ({ url }) => {
    void deliver(url)
  })

  // The launch document, if the app was started by one. Checked AFTER the
  // listener is attached: a cold start can deliver either way round depending
  // on how quickly the WebView gets going, and losing the file to a race is
  // worse than reading it twice (the second read just replaces the document
  // with itself).
  let handled = false
  try {
    const launch = await App.getLaunchUrl()
    if (launch?.url) handled = await deliver(launch.url)
  } catch (err) {
    console.error('Could not read the launch URL:', err)
  }
  if (!handled && !cancelled) onNone()

  return () => {
    cancelled = true
    void listener.remove()
  }
}
