import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useT } from '../../i18n'
import { subscribeAppActions, type AppAction } from '../../lib/appActions'
import { scanWithCamera } from '../../lib/documentScanner'
import { readNativeFile } from '../../lib/nativeOpen'
import type { ScanPage } from '../../lib/scan'
import { useShortcutStore } from '../../stores/shortcutStore'
import { openFiles } from '../../stores/tabStore'

const ScanDialog = lazy(() => import('../Scan/ScanDialog'))

/**
 * Runs the shortcuts and share-sheet actions the OS hands the phone app
 * (lib/appActions.ts). Mounted once, at the top of the app, so it works
 * whether the front page or a document is showing.
 *
 *   scan      the phone's scanner, then the same Scan dialog the front page
 *             opens (it makes the PDF and opens it)
 *   compress  open the PDF, then Export, which opens on the smaller copy
 *   sign      open the PDF, then the Sign menu
 *
 * Renders nothing except the Scan dialog while a scan is being finished.
 */
export default function ShortcutRunner() {
  const t = useT()
  const ask = useShortcutStore((s) => s.ask)
  const [scanPages, setScanPages] = useState<ScanPage[] | null>(null)
  const scanning = useRef(false)

  useEffect(() => {
    async function scan() {
      if (scanning.current) return
      scanning.current = true
      try {
        const jpegs = await scanWithCamera()
        if (!jpegs) return
        const { pageFromJpeg } = await import('../../lib/scan')
        setScanPages(await Promise.all(jpegs.map(pageFromJpeg)))
      } catch (err) {
        console.error(err)
        alert(t('app.landing_scan_failed', { message: (err as Error).message }))
      } finally {
        scanning.current = false
      }
    }

    async function withFile(action: Extract<AppAction, { file?: string }>) {
      // No file (Android's launcher has none to give): the request waits for
      // whatever document the user opens next.
      if (action.file) {
        try {
          const file = await readNativeFile(action.file)
          if (!file || !(await openFiles([file]))) return
        } catch (err) {
          console.error('A shortcut could not read its PDF:', err)
          return
        }
      }
      ask(action.type === 'compress' ? 'export' : 'sign')
    }

    let off: (() => void) | null = null
    let cancelled = false
    void subscribeAppActions((action) => {
      if (action.type === 'scan') void scan()
      else void withFile(action)
    }).then((unsubscribe) => {
      if (cancelled) unsubscribe()
      else off = unsubscribe
    })
    return () => {
      cancelled = true
      off?.()
    }
  }, [ask, t])

  if (!scanPages) return null
  return (
    <Suspense fallback={null}>
      <ScanDialog source="camera" initialPages={scanPages} onClose={() => setScanPages(null)} />
    </Suspense>
  )
}
