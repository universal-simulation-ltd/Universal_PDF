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
import VersionChip from './components/Header/VersionChip'
import FileMenu from './components/Toolbar/FileMenu'
import MobileWelcomeToast from './components/Onboarding/MobileWelcomeToast'
import { UniversalBar } from '@unisim/sdk'

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
      <UniversalBar />
      <header className="bg-slate-900 text-white relative">
        <div className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          <FileMenu variant="header" />
          <VersionChip />
        </div>
        <div style={{ paddingRight: 'var(--doc-scrollbar-width, 0px)' }}>
        <div
          className="mx-auto w-full flex items-center justify-between gap-3 py-2 min-h-[52px]"
          style={{ maxWidth: 'clamp(600px, var(--doc-display-width, 80rem), 80rem)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {doc && <ToolbarDesktopTools />}
          </div>
          <div className="flex items-center gap-2 justify-end">
            {doc && <ToolbarDesktopActions />}
          </div>
        </div>
        </div>
      </header>

      {doc && <ToolbarMobile />}
      {doc && <MobileWelcomeToast />}

      <main className="flex-1 min-h-0 pb-16 md:pb-0">
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
