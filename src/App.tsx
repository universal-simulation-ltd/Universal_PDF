import { useEffect, useRef, useState } from 'react'
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
import MobileWelcomeToast from './components/Onboarding/MobileWelcomeToast'
import { UniversalAppsNavBar, UniversalBar, ChangelogMenu } from '@unisim/sdk'

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

const REPO_URL = 'https://github.com/universal-simulation-ltd/Universal_PDF'

function isPdfFile(file: File) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

export default function App() {
  const loadFile = usePdfStore((s) => s.loadFile)
  const doc = usePdfStore((s) => s.doc)
  const loading = usePdfStore((s) => s.loading)
  const refreshRecents = usePdfStore((s) => s.refreshRecents)
  const loadFromCurrentUrl = usePdfStore((s) => s.loadFromCurrentUrl)
  const reset = usePdfStore((s) => s.reset)

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

  // The currently-open document as a File, for the Advanced-menu dialogs that
  // start from it (Merge with another PDF, Convert into images). A fresh copy of
  // sourceBytes each time — pdf-lib / pdf.js detach the ArrayBuffer they consume.
  const currentDocFile =
    sourceBytes && fileName ? new File([sourceBytes.slice(0)], fileName, { type: 'application/pdf' }) : null

  const stampPickerOpen = useSignatureStore((s) => s.stampPickerOpen)

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
    return desktop.onOpenPdf(({ name, bytes }) => {
      const file = new File([bytes], name, { type: 'application/pdf' })
      loadFile(file).catch((err) => {
        console.error(err)
        alert('Failed to load PDF')
      })
    })
  }, [loadFile])

  const [dragOver, setDragOver] = useState(false)
  const dragCounter = useRef(0)

  useEffect(() => {
    function onEnter(e: DragEvent) {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      dragCounter.current++
      setDragOver(true)
    }
    function onOver(e: DragEvent) {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
    }
    function onLeave(e: DragEvent) {
      e.preventDefault()
      dragCounter.current = Math.max(0, dragCounter.current - 1)
      if (dragCounter.current === 0) setDragOver(false)
    }
    async function onDrop(e: DragEvent) {
      e.preventDefault()
      dragCounter.current = 0
      setDragOver(false)
      const file = e.dataTransfer?.files?.[0]
      if (!file) return
      if (!isPdfFile(file)) {
        alert('Please drop a PDF file.')
        return
      }
      try {
        await loadFile(file)
      } catch (err) {
        console.error(err)
        alert('Failed to load PDF')
      }
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [loadFile])

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {!doc && (
        <div className="relative z-50">
          <UniversalAppsNavBar
            product="pdf"
            productLogo={<ProductLogo />}
            suiteSwitcherIconSrc={`${import.meta.env.BASE_URL}unisim-icon.png`}
            contentClassName={CONTAINER}
          />
        </div>
      )}
      {/* The full navbar is landing-page only. While a doc is open we keep just
          the suite brand strip up top for cross-app visual continuity; profile
          + changelog move down into the dark tools bar below. */}
      {doc && <UniversalBar />}
      {doc && (
        <div className="bg-slate-900 text-white relative z-[45] overflow-x-auto" style={{ paddingRight: 'var(--doc-scrollbar-width, 0px)' }}>
          {/* Home, pinned to the far left of the bar — out in the margin to the
              left of the centred tool cluster, so it reads as window chrome
              rather than an editing tool. The universal navbar is landing-page
              only; while a doc is open the dark toolbar is the whole chrome.
              lg+ only: that margin only exists on wider screens. Mobile keeps a
              home button inside the cluster below.

              Actions used to sit here too. It now rides in the profile pill at
              the far right — one control, one dropdown — matching the other
              Universal Apps. */}
          <div className="hidden lg:flex absolute inset-y-0 left-0 z-10 items-center gap-1 pl-3">
            <button
              type="button"
              onClick={reset}
              title="Back to home"
              aria-label="Back to home"
              className="p-1.5 rounded-md text-[#ea580c] hover:text-orange-400 hover:bg-slate-800 active:bg-slate-700"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 10.5 12 3l9 7.5" />
                <path d="M5.5 9.5V21h13V9.5" />
                <path d="M10 21v-6h4v6" />
              </svg>
            </button>
          </div>
          <div
            className="mx-auto w-full min-w-max flex items-center justify-between gap-6 py-2 min-h-[52px]"
            style={{ maxWidth: 'clamp(600px, var(--doc-display-width, 80rem), 80rem)' }}
          >
            {/* lg:pl-5 matches the navbar header's 20px left padding so the
                Select tool below lines up under the suite switcher. The whole
                desktop tool chrome switches to the bottom bar below lg (1024px)
                — at narrower widths the Select group collides with Actions. */}
            <div className="flex items-center gap-2 shrink-0 [&>*]:shrink-0 lg:pl-5">
              {/* Mobile-only home — desktop pins it to the far left above. */}
              <button
                type="button"
                onClick={reset}
                title="Back to home"
                aria-label="Back to home"
                className="lg:hidden p-1.5 rounded-md text-[#ea580c] hover:text-orange-400 hover:bg-slate-800 active:bg-slate-700"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 10.5 12 3l9 7.5" />
                  <path d="M5.5 9.5V21h13V9.5" />
                  <path d="M10 21v-6h4v6" />
                </svg>
              </button>
              <ToolbarDesktopTools />
            </div>
            <div className="flex items-center gap-2 justify-end shrink-0 [&>*]:shrink-0">
              <ToolbarDesktopActions />
              {/* Mobile-only profile + changelog — on md+ they're pinned to the
                  far right of the bar below, mirroring the Home/Actions chrome
                  on the far left. */}
              <div className="lg:hidden flex items-center gap-2 [&>*]:shrink-0">
                <ToolbarUserProfile actions={<FileMenu variant="rows" />} />
                <ChangelogMenu
                  iconSrc={`${import.meta.env.BASE_URL}unisim-icon.png`}
                  productFilter="pdf"
                />
              </div>
            </div>
          </div>
          {/* Profile + changelog previously lived in the top navbar; with that
              bar gone while viewing, they're pinned to the far right of the
              bar — mirroring the Home/Actions chrome pinned to the far left.
              The right offset tracks the viewer scrollbar width (like the
              bar's own padding-right) so the cluster lines up with the
              document's right edge. */}
          <div
            className="hidden lg:flex absolute inset-y-0 z-10 items-center gap-2 pr-3"
            style={{ right: 'var(--doc-scrollbar-width, 0px)' }}
          >
            <ToolbarUserProfile actions={<FileMenu variant="rows" />} />
            <ChangelogMenu
              iconSrc={`${import.meta.env.BASE_URL}unisim-icon.png`}
              productFilter="pdf"
            />
          </div>
        </div>
      )}

      {doc && <ToolbarMobile />}
      {doc && <MobileWelcomeToast />}

      {/* When a PDF is open, isolate the viewer in its own stacking context so
          its positioned layers (Konva canvas, annotation/form overlays, the
          zoom menu) stay below the navbar — otherwise they bubble up to the
          root context and can paint over the navbar's open dropdowns. */}
      <main className={`flex-1 min-h-0 md:pb-0 ${doc ? 'pb-[calc(4rem_+_env(safe-area-inset-bottom))] relative z-0 isolate' : 'overflow-auto'}`}>
        {loading ? (
          <div className="h-full flex items-center justify-center text-slate-500">
            Loading PDF…
          </div>
        ) : doc ? (
          <PdfViewer />
        ) : (
          <LandingPage />
        )}
      </main>

      {!doc && !loading && (
        <footer className="mt-auto border-t border-slate-200 bg-white">
          <div className={`${CONTAINER} py-4 flex flex-row items-center gap-3 sm:gap-4 text-xs text-slate-500`}>
            <div className="flex items-center gap-2">
              <span>
                100% Open source and free. Hosted by{' '}
                <a
                  href="https://www.unisim.co.uk"
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-700 hover:text-orange-600 underline-offset-2 hover:underline"
                >
                  UNI SIM
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

      {dragOver && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center bg-orange-600/20">
          <div className="absolute inset-4 border-4 border-dashed border-orange-500 rounded-2xl" />
          <div className="bg-white shadow-xl rounded-xl px-6 py-5 flex items-center gap-3">
            <div className="text-3xl">📄</div>
            <div>
              <div className="font-semibold text-slate-900">Drop to open</div>
              <div className="text-xs text-slate-500">PDF files only</div>
            </div>
          </div>
        </div>
      )}

      <PageNavigator />
      <SignaturePad />
      <SignatureImport />
      {stampPickerOpen && <StampPicker />}
      <LivePreview />
      <PresentMode />
      <HostedStoreDialog />
      <SendToSignDialog />
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
