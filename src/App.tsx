import { useEffect, useState } from 'react'
import {
  ToolbarDesktopActions,
  ToolbarDesktopTools,
  ToolbarMobile,
  useToolbarKeyboardShortcuts
} from './components/Toolbar/Toolbar'
import PdfViewer from './components/Viewer/PdfViewer'
import PageNavigator from './components/Viewer/PageNavigator'
import SignaturePad from './components/Signature/SignaturePad'
import StampPicker from './components/Signature/StampPicker'
import SignatureImport from './components/Signature/SignatureImport'
import LandingPage from './components/Landing/LandingPage'
import LivePreview from './components/Preview/LivePreview'
import PresentMode from './components/Present/PresentMode'
import ProductLogo from './components/Header/ProductLogo'
import ToolbarUserProfile from './components/Header/ToolbarUserProfile'
import FileMenu from './components/Toolbar/FileMenu'
import HostedStoreDialog from './components/HostedStoreDialog'
import SendToSignDialog from './components/SendToSignDialog'
import OcrModal from './components/Ocr/OcrModal'
import MergeDialog from './components/Convert/MergeDialog'
import ConvertDialog from './components/Convert/ConvertDialog'
import MetadataDialog from './components/Metadata/MetadataDialog'
import QrDialog from './components/Qr/QrDialog'
import MobileWelcomeToast from './components/Onboarding/MobileWelcomeToast'
import { UniversalAppsNavBar, UniversalBar, ChangelogMenu, DropAnywhere, UpdateNotice, useFileDrop } from '@unisim/sdk'

// Apply the saved language to <html lang> on first mount.
import { persistLang, readSavedLang } from './lib/lang'
if (typeof document !== 'undefined') {
  document.documentElement.lang = readSavedLang()
  // Re-run persist (no-op if unchanged) so this stays in sync if the
  // user clears storage between sessions.
  persistLang(readSavedLang())
}
import { usePdfStore } from './stores/pdfStore'
import { useSignatureStore } from './stores/signatureStore'
import { CONTAINER } from './lib/layout'
import { OfficeImportError, toViewablePdf } from './lib/officeToPdf'
import { isNativeShell, subscribeNativeOpenPdf } from './lib/nativeOpen'

const REPO_URL = 'https://github.com/universal-simulation-ltd/Universal_PDF'

export default function App() {
  const loadFile = usePdfStore((s) => s.loadFile)
  const doc = usePdfStore((s) => s.doc)
  const loading = usePdfStore((s) => s.loading)
  const refreshRecents = usePdfStore((s) => s.refreshRecents)
  const loadFromCurrentUrl = usePdfStore((s) => s.loadFromCurrentUrl)

  const ocrOpen = usePdfStore((s) => s.ocrOpen)
  const setOcrOpen = usePdfStore((s) => s.setOcrOpen)
  const mergeOpen = usePdfStore((s) => s.mergeOpen)
  const setMergeOpen = usePdfStore((s) => s.setMergeOpen)
  const convertOpen = usePdfStore((s) => s.convertOpen)
  const setConvertOpen = usePdfStore((s) => s.setConvertOpen)
  const metadataOpen = usePdfStore((s) => s.metadataOpen)
  const setMetadataOpen = usePdfStore((s) => s.setMetadataOpen)
  const sourceBytes = usePdfStore((s) => s.sourceBytes)
  const fileName = usePdfStore((s) => s.fileName)
  const importNotice = usePdfStore((s) => s.importNotice)
  const dismissImportNotice = usePdfStore((s) => s.dismissImportNotice)

  // The currently-open document as a File, for the Advanced-menu dialogs that
  // start from it (Merge with another PDF, Convert into images). A fresh copy of
  // sourceBytes each time — pdf-lib / pdf.js detach the ArrayBuffer they consume.
  const currentDocFile =
    sourceBytes && fileName ? new File([sourceBytes.slice(0)], fileName, { type: 'application/pdf' }) : null

  const stampPickerOpen = useSignatureStore((s) => s.stampPickerOpen)

  // Electron adds `?launching=1` when the app was started by the OS handing it
  // a PDF (double-click / "Open with"). The file itself cannot arrive until the
  // bundle has loaded, so without this the first paint is the landing page —
  // which then vanishes. The user picked a document; show them a document
  // opening, not the front door on the way past.
  //
  // On iOS and Android there is no such flag to pass — the OS hands the file to
  // the native side, which can only be asked for it asynchronously — so a
  // native shell holds the loading state on every launch and releases it a
  // bridge round-trip later. A few milliseconds of "Loading PDF…" on an
  // ordinary launch is a better trade than the landing page appearing and
  // vanishing on a launch that did carry a document.
  const [launching, setLaunching] = useState(
    () => new URLSearchParams(window.location.search).has('launching') || isNativeShell()
  )

  // While the launch file is in flight the app is heading for the document
  // view, so it wears that view's chrome. Half the flash was the landing page's
  // navbar and footer, not just its body.
  const showLanding = !doc && !launching

  useToolbarKeyboardShortcuts(!!doc)

  useEffect(() => {
    refreshRecents()
    // If we landed on /#abc12345, try to reopen that PDF straight from
    // IndexedDB so a refresh restores the editor state.
    loadFromCurrentUrl().catch(() => {})
    function onHashChange() {
      loadFromCurrentUrl().catch(() => {})
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [refreshRecents, loadFromCurrentUrl])

  // Desktop (Electron) only — PDFs opened via the OS ("Open with → Universal
  // PDF" / double-click) arrive from the main process as bytes. Load them
  // straight away so the app opens onto the document, not the landing page.
  useEffect(() => {
    const desktop = window.desktop
    if (!desktop) return
    const offOpen = desktop.onOpenPdf(({ name, bytes }) => {
      const file = new File([bytes], name, { type: 'application/pdf' })
      loadFile(file)
        .catch((err) => {
          console.error(err)
          alert('Failed to load PDF')
        })
        // Cleared only once the load has settled: dropping it the moment the
        // bytes arrive would hand one frame back to the landing page before
        // the store's own `loading` picks up — the same flash, one step later.
        .finally(() => setLaunching(false))
    })
    const offNone = desktop.onNoPdf(({ unreadable }) => {
      setLaunching(false)
      if (unreadable) alert(`Could not open ${unreadable}`)
    })
    return () => {
      offOpen()
      offNone()
    }
  }, [loadFile])

  // Web only — an INSTALLED PWA registered as a `.pdf` handler (Chromium
  // desktop) is handed the file on `launchQueue`, the browser's equivalent of
  // the IPC message above. The manifest's `file_handlers.action` carries the
  // same `?launching=1`, so this path holds the loading state from the first
  // paint too.
  useEffect(() => {
    if (window.desktop) return
    const queue = window.launchQueue
    if (!queue) {
      // No file handling here at all, so a `?launching=1` that reached this
      // page (a bookmark, a shared link) must not strand it on the placeholder.
      setLaunching(false)
      return
    }
    queue.setConsumer((params) => {
      const handle = params.files?.[0]
      if (!handle) {
        setLaunching(false)
        return
      }
      handle
        .getFile()
        .then((file) => loadFile(file))
        .catch((err) => {
          console.error(err)
          alert('Failed to load PDF')
        })
        .finally(() => setLaunching(false))
    })
  }, [loadFile])

  // iOS / Android — a PDF opened through the share sheet or the chooser. Same
  // shape as the two paths above: a file turns up, or word that none is coming.
  useEffect(() => {
    if (window.desktop || window.launchQueue) return
    let unsubscribe: (() => void) | null = null
    let cancelled = false
    void subscribeNativeOpenPdf(
      (file) => {
        loadFile(file)
          .catch((err) => {
            console.error(err)
            alert('Failed to load PDF')
          })
          .finally(() => setLaunching(false))
      },
      () => setLaunching(false)
    ).then((off) => {
      if (cancelled) off()
      else unsubscribe = off
    })
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [loadFile])

  // ⚠️ Backstop for the browser and native paths. The PWA's consumer fires when
  // the browser has launch parameters and stays silent when it does not, so a
  // `?launching=1` opened by hand would otherwise wait on a file that is never
  // coming; on iOS/Android it catches a bridge that never answers. The desktop
  // needs no equivalent — its main process says so explicitly over `no-pdf`.
  useEffect(() => {
    if (!launching || window.desktop) return
    const timer = window.setTimeout(() => setLaunching(false), 3000)
    return () => window.clearTimeout(timer)
  }, [launching])

  // Drop a PDF anywhere on the page and it opens — the SDK's `pageWide`, not the
  // hand-rolled `window` listener this used to be. That copy predated the hook
  // and carried the whole of its cost: a depth counter, a bubble-phase drop
  // handler, and a SECOND capture-phase one whose only job was to clear the
  // overlay after a zone stopped the event so one file was not loaded twice. All
  // three now live once, in `useFileDrop`, which skips any drop that landed
  // inside a `data-unisim-dropzone` instead of asking the zone to stop the event.
  //
  // This one covers the OPEN DOCUMENT only. The landing page runs its own
  // page-wide zone around the drop circle (see `Landing/LandingPage.tsx`), and
  // `disabled` here hands the page to it — the hook picks the last-mounted zone
  // that isn't disabled, and the landing page mounts inside this component.
  //
  // Merge and Convert take a file of their own while a document is open, so the
  // page belongs to the dialog rather than the viewer behind it.
  const dialogOwnsDrop = mergeOpen || convertOpen
  const pageDrop = useFileDrop({
    onFiles: async (files) => {
      const file = files[0]
      if (!file) return
      // A page-wide target takes whatever lands on it; `accept` only ever
      // filtered the picker, and there is no picker here — so `toViewablePdf`
      // does the checking, converting a Word or OpenDocument file on the way
      // through and refusing anything else with a message worth reading.
      try {
        const { file: pdf, notice } = await toViewablePdf(file)
        await loadFile(pdf, { notice })
      } catch (err) {
        console.error(err)
        alert(err instanceof OfficeImportError ? err.message : 'Failed to load PDF')
      }
    },
    clickToBrowse: false,
    pageWide: true,
    disabled: !doc || dialogOwnsDrop,
  })
  // ⚠️ `pageOver` goes true for any page drag whether or not this zone is
  // disabled — the hook lights every page-wide zone and only checks `disabled`
  // when deciding who TAKES the file. Promising a drop that will not be taken is
  // a lie, so the hint is gated on the same condition.
  const showDropHint = pageDrop.pageOver && !!doc && !dialogOwnsDrop

  return (
    // ⚠️ pt-[env(safe-area-inset-top)] is for the native (Capacitor) builds, not
    // the web one. Capacitor runs the app in a FULL-SCREEN WKWebView / Android
    // WebView, so without it the top bar renders underneath the iOS status bar
    // and Dynamic Island — "Universal PDF" sitting on top of the clock, which is
    // exactly what the first simulator run showed. In a browser the inset is 0,
    // so this is a no-op on the web and on desktop.
    //
    // It lives here rather than in @unisim/sdk's UniversalAppsNavBar because
    // that bar is shared by every Universal App, and the padding belongs to
    // whichever of them is wrapped for a phone — currently only this one.
    <div className="flex flex-col h-full bg-slate-100 pt-[env(safe-area-inset-top)]">
      {showLanding && (
        <div className="relative z-50">
          <UniversalAppsNavBar
            product="pdf"
            productLogo={<ProductLogo />}
            suiteSwitcherIconSrc={`${import.meta.env.BASE_URL}unisim-icon.png`}
            contentClassName={CONTAINER}
          />
          {/* Renders nothing until this tab is genuinely running superseded
              code — see the SDK's useAppUpdate. Deliberately inside the
              landing-page block: with a document open there is unsaved work on
              screen, and inviting a reload over the top of it is worse than
              waiting until the user is back at the front door. */}
          <div className={`${CONTAINER} pt-4`}>
            <UpdateNotice />
          </div>
        </div>
      )}
      {/* The full navbar is landing-page only. While a doc is open we keep just
          the suite brand strip up top for cross-app visual continuity; profile
          + changelog move down into the dark tools bar below. */}
      {(doc || launching) && <UniversalBar />}
      {doc && (
        <div className="bg-slate-900 text-white relative z-[45] overflow-x-auto" style={{ paddingRight: 'var(--doc-scrollbar-width, 0px)' }}>
          {/* No home button on this bar. Leaving an open document is
              Actions → File → Close PDF, in the profile pill at the far right —
              one control, one dropdown, matching the other Universal Apps. A
              second way out pinned to the far left (and a third inside the tool
              cluster on mobile) spent the bar's scarcest space on a control the
              menu already carries. Actions used to sit out here too, and moved
              into the same pill for the same reason. */}
          <div
            className="mx-auto w-full min-w-max flex items-center justify-between gap-6 py-2 min-h-[52px]"
            style={{ maxWidth: 'clamp(600px, var(--doc-display-width, 80rem), 80rem)' }}
          >
            {/* lg:pl-5 matches the navbar header's 20px left padding so the
                Select tool below lines up under the suite switcher. The whole
                desktop tool chrome switches to the bottom bar below lg (1024px)
                — at narrower widths the Select group collides with Actions. */}
            <div className="flex items-center gap-2 shrink-0 [&>*]:shrink-0 lg:pl-5">
              <ToolbarDesktopTools />
            </div>
            {/* Profile + changelog previously lived in the top navbar; with
                that bar gone while viewing, they carry the whole of the
                document's chrome and sit at the end of this row.
                ⚠️ They used to be a SECOND copy, absolutely positioned against
                the bar's right edge — the window's edge — while this row is
                centred at the DOCUMENT's width. The two collided whenever the
                window was about as wide as the document (~1280px, i.e. a
                maximised window on a 13" screen): the pinned cluster painted
                straight over Actions, and the profile pill and the changelog
                icon landed on top of the Actions menu. In the flow they cannot
                overlap anything, and they now genuinely line up with the
                document's right edge at every width — which is what the old
                comment claimed but only achieved when the document happened to
                fill the window. */}
            <div className="flex items-center gap-2 justify-end shrink-0 [&>*]:shrink-0 lg:pr-3">
              <ToolbarDesktopActions />
              <ToolbarUserProfile actions={<FileMenu variant="rows" />} />
              <ChangelogMenu
                iconSrc={`${import.meta.env.BASE_URL}unisim-icon.png`}
                productFilter="pdf"
              />
            </div>
          </div>
        </div>
      )}

      {doc && <ToolbarMobile />}
      {doc && <MobileWelcomeToast />}

      {/* Converted-from-Word notice. It sits in the flow above the viewer rather
          than floating over it: what it says changes how you should read the
          document, so it should not be something you dismiss by accident before
          reading, nor cover the first line of the page it is describing. */}
      {doc && importNotice && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900">
          <div className="mx-auto w-full max-w-5xl px-4 py-2 flex items-start gap-3 text-[13px]">
            <span aria-hidden="true">ℹ</span>
            <p className="flex-1">{importNotice}</p>
            <button
              type="button"
              onClick={dismissImportNotice}
              className="shrink-0 rounded px-2 py-0.5 hover:bg-amber-100 font-medium"
              aria-label="Dismiss conversion notice"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* When a PDF is open, isolate the viewer in its own stacking context so
          its positioned layers (Konva canvas, annotation/form overlays, the
          zoom menu) stay below the navbar — otherwise they bubble up to the
          root context and can paint over the navbar's open dropdowns. */}
      <main className={`flex-1 min-h-0 md:pb-0 ${doc ? 'pb-[calc(4rem_+_env(safe-area-inset-bottom))] relative z-0 isolate' : 'overflow-auto'}`}>
        {loading || launching ? (
          <div className="h-full flex items-center justify-center text-slate-500">
            Loading PDF…
          </div>
        ) : doc ? (
          <PdfViewer />
        ) : (
          <LandingPage />
        )}
      </main>

      {showLanding && !loading && (
        <footer className="mt-auto border-t border-slate-200 bg-white">
          <div className={`${CONTAINER} py-4 flex flex-row items-center gap-3 sm:gap-4 text-xs text-slate-500`}>
            <div className="flex items-center gap-2">
              <span>
                With{' '}
                <span aria-hidden="true" className="text-orange-600">&hearts;</span>
                <span className="sr-only">love</span>{' '}
                from{' '}
                <a href="https://www.unisim.co.uk" target="_blank" rel="noreferrer" className="text-slate-700 hover:text-orange-700 underline-offset-2 hover:underline">
                  UNISIM.co.uk
                </a>
              </span>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="Universal PDF on GitHub"
                title="View source on GitHub"
                className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-5 h-5"
                  aria-hidden="true"
                >
                  <path d="M12 .5C5.65.5.5 5.65.5 12.02c0 5.09 3.29 9.4 7.86 10.92.57.1.78-.25.78-.55 0-.27-.01-1-.02-1.96-3.2.69-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.7 1.25 3.36.95.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18.92-.26 1.91-.39 2.89-.39.98 0 1.97.13 2.89.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.18 1.82 1.18 3.08 0 4.42-2.69 5.39-5.26 5.68.41.35.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .3.21.66.79.55 4.57-1.52 7.86-5.83 7.86-10.92C23.5 5.65 18.35.5 12 .5z" />
                </svg>
                <span className="hidden sm:inline">GitHub</span>
              </a>
            </div>
          </div>
        </footer>
      )}

      {/* The suite's shared page-wide hint, replacing a per-app overlay. Same
          sentence, same orange, but now identical to the one Compress, Video and
          Signatures show — and it steps aside on its own over a drop zone, which
          the old copy could not do. */}
      <DropAnywhere
        show={showDropHint}
        title="Drop to open"
        hint="PDF files only — it replaces the document you have open"
        icon={<span aria-hidden="true">📄</span>}
      />


      <PageNavigator />
      <SignaturePad />
      <SignatureImport />
      {stampPickerOpen && <StampPicker />}
      <LivePreview />
      <PresentMode />
      <HostedStoreDialog />
      <SendToSignDialog />
      <QrDialog />
      {ocrOpen && sourceBytes && (
        <OcrModal
          sourceBytes={sourceBytes}
          fileName={fileName ?? 'document.pdf'}
          onClose={() => setOcrOpen(false)}
          onOpen={(file) => {
            loadFile(file).catch((err) => {
              console.error(err)
              alert('Failed to load searchable PDF')
            })
          }}
        />
      )}
      {/* Advanced-menu dialogs, seeded with the open document so they act on it. */}
      {mergeOpen && <MergeDialog initialFile={currentDocFile} onClose={() => setMergeOpen(false)} />}
      {convertOpen && (
        <ConvertDialog initialMode="pdf-to-images" initialPdf={currentDocFile} onClose={() => setConvertOpen(false)} />
      )}
      {metadataOpen && sourceBytes && (
        <MetadataDialog sourceBytes={sourceBytes} onClose={() => setMetadataOpen(false)} />
      )}
    </div>
  )
}
