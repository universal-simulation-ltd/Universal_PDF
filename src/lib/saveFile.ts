// Handing a finished file to the user — the one step that is genuinely
// different on a phone.
//
// ⚠️ In a Capacitor WKWebView the `download` attribute is IGNORED. Not
// refused, not errored: the anchor is clicked, nothing happens, and no
// exception reaches the console. So the browser path below cannot be the only
// one, or every export button in the app is dead on iOS while looking fine in
// every test that runs in a real browser.
//
// iOS expects the share sheet instead, which is also what someone on a phone
// actually wants — Save to Files, Save to Photos, or straight into a message.
// There is no "Downloads folder" on the device to save to.
//
// The plugins are imported dynamically so they never reach the web bundle,
// which has a working path of its own and would otherwise pay for code that
// can only no-op in a browser. Same reasoning as `nativeOpen.ts` next door,
// which is the mirror image of this file: that one takes a document FROM iOS
// into the app, this one hands one back out.

/**
 * True inside a Capacitor WebView. Reads the global the native runtime injects
 * rather than importing `@capacitor/core`, so the web build does not gain a
 * dependency just to answer "am I native?".
 */
export function isNativeShell(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  try {
    return cap?.isNativePlatform?.() === true
  } catch {
    return false
  }
}

/** `data:<mime>;base64,<payload>` — Filesystem wants the payload alone. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'))
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(blob)
  })
}

async function shareNative(blob: Blob, filename: string): Promise<void> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ])
  // Cache, not Documents: this is a hand-off to the share sheet, not a file the
  // app is keeping. Writing to Documents would quietly accumulate every export
  // the user ever made in a folder they can see over iTunes/Finder.
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
  })
  await Share.share({ files: [uri] })
}

function downloadInBrowser(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the browser a tick to start the download before reclaiming memory.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Save `blob` as `filename` — a download in a browser, the share sheet on a
 * phone.
 *
 * Deliberately returns `void` rather than a Promise: every call site is a
 * click handler that fires and forgets, and making it awaitable would only
 * invite callers to block a button on a sheet the user may never dismiss.
 */
export function saveBlob(blob: Blob, filename: string): void {
  if (!isNativeShell()) {
    downloadInBrowser(blob, filename)
    return
  }
  shareNative(blob, filename).catch((err: unknown) => {
    // Dismissing the share sheet rejects. That is the user saying no, not a
    // failure, and it must not surface as one.
    const message = err instanceof Error ? err.message : String(err)
    if (/cancel/i.test(message)) return
    console.error('Could not share the file', err)
  })
}
