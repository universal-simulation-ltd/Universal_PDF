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
import EmailVerifyModal from './components/Signature/EmailVerifyModal'
import SignatureImport from './components/Signature/SignatureImport'
import LandingPage from './components/Landing/LandingPage'
import LivePreview from './components/Preview/LivePreview'
import ProductLogo from './components/Header/ProductLogo'
import FileMenu from './components/Toolbar/FileMenu'
import MobileWelcomeToast from './components/Onboarding/MobileWelcomeToast'
import { UniversalAppsNavBar } from '@unisim/sdk'

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

  const stampPickerOpen = useSignatureStore((s) => s.stampPickerOpen)
  const emailVerifyOpen = useSignatureStore((s) => s.emailVerifyOpen)

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
        <UniversalAppsNavBar
          product="pdf"
          productLogo={<ProductLogo />}
          fileMenu={<FileMenu variant="header" />}
          suiteSwitcherIconSrc={`${import.meta.env.BASE_URL}unisim-icon.png`}
        />
      )}
      {doc && (
        <div className="bg-slate-900 text-white relative z-30" style={{ paddingRight: 'var(--doc-scrollbar-width, 0px)' }}>
          <div className="md:hidden absolute inset-0 flex items-center justify-center pointer-events-none select-none" aria-hidden="true">
            <div className="flex items-center gap-1.5 overflow-hidden">
              <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
                <rect width="24" height="24" rx="5" fill="#ea580c" />
                <polygon points="4,2.5 14.5,2.5 14.5,8 20,8 20,21.5 4,21.5" fill="white" />
                <polygon points="14.5,2.5 20,8 14.5,8" fill="#fdba74" />
                <text x="12" y="18" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="6" fontWeight="900" fill="#ea580c" letterSpacing="0.4">PDF</text>
              </svg>
              <span className="font-semibold text-sm text-white whitespace-nowrap">Universal PDF</span>
            </div>
          </div>
          <div
            className="mx-auto w-full flex items-center justify-between gap-3 py-2 min-h-[52px] px-3"
            style={{ maxWidth: 'clamp(600px, var(--doc-display-width, 80rem), 80rem)' }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <FileMenu variant="toolbar" />
              <ToolbarDesktopTools />
            </div>
            <div className="flex items-center gap-2 justify-end">
              <span className="text-xs text-slate-400 select-none whitespace-nowrap">100% Free · 100% Open source</span>
              <ToolbarDesktopActions />
            </div>
          </div>
        </div>
      )}

      {doc && <ToolbarMobile />}
      {doc && <MobileWelcomeToast />}

      <main className={`flex-1 min-h-0 md:pb-0${doc ? ' pb-16' : ' overflow-auto'}`}>
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
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-4 flex flex-row items-center gap-3 sm:gap-4 text-xs text-slate-500">
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
      {emailVerifyOpen && <EmailVerifyModal />}
      <LivePreview />
    </div>
  )
}
