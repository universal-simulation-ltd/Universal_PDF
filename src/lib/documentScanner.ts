import { isNativeShell } from './nativeOpen'

/**
 * The phone's own document scanner, through the app's `DocumentScanner`
 * plugin. Only the iOS and Android apps have one — the browser, the desktop
 * app and the extension never show the button that reaches this.
 *
 *   iOS      VisionKit's `VNDocumentCameraViewController`
 *            ios/App/App/DocumentScanner.swift
 *   Android  Google's ML Kit Document Scanner (Play services)
 *            android/app/src/main/java/uk/co/unisim/pdf/DocumentScannerPlugin.java
 *
 * Both find the page edges, flatten the page, take several pages in one go and
 * let the user retake one — and both run on the phone. Each writes the pages
 * as JPEGs to the app's own temporary storage and answers with their file
 * URLs; they are read here and deleted straight after.
 *
 * ⚠️ The plugin lives in THIS repository's native projects, not in a package,
 * so `npx cap sync` neither adds nor removes it: on iOS it is registered by
 * `MainViewController`, on Android by `MainActivity`.
 */

interface ScanResult {
  /** File URLs of the scanned pages, in order. Empty when cancelled. */
  pages: string[]
  cancelled?: boolean
}

interface DocumentScannerPlugin {
  isAvailable(): Promise<{ available: boolean }>
  scan(): Promise<ScanResult>
  cleanup(options: { pages: string[] }): Promise<void>
}

let plugin: Promise<DocumentScannerPlugin> | null = null
function getPlugin(): Promise<DocumentScannerPlugin> {
  plugin ??= import('@capacitor/core').then(({ registerPlugin }) =>
    registerPlugin<DocumentScannerPlugin>('DocumentScanner'),
  )
  return plugin
}

/**
 * Can this device scan with its camera? False off the phone apps, on an iOS
 * device without a camera, on Android without Google Play services, and on a
 * build whose native half predates the plugin (an old app with a new web
 * bundle can't happen in a store build, but costs nothing to answer for).
 */
export async function isDocumentScanAvailable(): Promise<boolean> {
  if (!isNativeShell()) return false
  try {
    const { available } = await (await getPlugin()).isAvailable()
    return available === true
  } catch {
    return false
  }
}

/**
 * Open the scanner. Resolves with each page's JPEG bytes, or `null` if the
 * user backed out without keeping a page.
 */
export async function scanWithCamera(): Promise<Uint8Array[] | null> {
  const p = await getPlugin()
  const result = await p.scan()
  if (result.cancelled || result.pages.length === 0) return null
  const { Capacitor } = await import('@capacitor/core')
  try {
    const pages: Uint8Array[] = []
    for (const url of result.pages) {
      const res = await fetch(Capacitor.convertFileSrc(url))
      if (!res.ok) throw new Error(`Could not read scanned page (${res.status})`)
      pages.push(new Uint8Array(await res.arrayBuffer()))
    }
    return pages
  } finally {
    // The pages are in memory now; the copies on disk are the only trace the
    // scan leaves on the phone, so they go whatever happened above.
    p.cleanup({ pages: result.pages }).catch(() => {})
  }
}
