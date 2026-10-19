import { lazy, Suspense, useEffect, useRef } from 'react'
import { requestSearch } from '@unisim/sdk'
import { useT } from '../i18n'
import { usePdfStore } from '../stores/pdfStore'
import { useSignatureStore } from '../stores/signatureStore'
import { useTabStore } from '../stores/tabStore'
import { useShortcutStore } from '../stores/shortcutStore'
import { setStatusBarOverDarkChrome } from '../lib/nativeOpen'
import PageNavigator from '../components/Viewer/PageNavigator'
import SignaturePad from '../components/Signature/SignaturePad'
import SignatureImport from '../components/Signature/SignatureImport'
import UnsavedChangesDialog from '../components/Exit/UnsavedChangesDialog'
import LockedFilePrompt from '../components/Lock/LockedFilePrompt'
import { Icon, PATHS } from './icons'
import { isKnowledge, topScreen, useNav, type Screen, type Tab } from './nav'
import { useEdgeSwipeBack } from './edgeSwipe'
import { useJobs } from './jobs'
import { usePhonePrefs } from './prefs'
import DeskScreen from './DeskScreen'
import DocumentScreen, { leaveDocument } from './DocumentScreen'
import SignScreen from './SignScreen'
import QrScreen from './QrScreen'
import ShareScreen from './ShareScreen'
import MoreSheet from './MoreSheet'
import TuneScreen from './TuneScreen'
import SignaturesScreen from './SignaturesScreen'
import KnowledgeScreen, { useKnowledgeBaseRequests } from './KnowledgeScreen'
import { SignedMoment, SmallerMoment } from './Moments'
import './native.css'

// The phone app's screens (see shell.ts for when they are used). Three tabs
// with no document open; with one open, the document, with pages and sheets
// stacked over it. The document screen stays mounted under its pages so the
// viewer keeps its place, zoom and work while Sign or Share is on top.
//
// The website's own dialogs that the phone still uses are mounted here too —
// App.tsx returns this tree in place of its own, so nothing of App's render
// reaches the phone.

const StampPicker = lazy(() => import('../components/Signature/StampPicker'))
const SendForSignatureDialog = lazy(() => import('../components/Signature/SendForSignatureDialog'))
const OcrModal = lazy(() => import('../components/Ocr/OcrModal'))
const MergeDialog = lazy(() => import('../components/Convert/MergeDialog'))
const ConvertDialog = lazy(() => import('../components/Convert/ConvertDialog'))
const CompareDialog = lazy(() => import('../components/Compare/CompareDialog'))
const ScanDialog = lazy(() => import('../components/Scan/ScanDialog'))
const ShortcutRunner = lazy(() => import('../components/Shortcuts/ShortcutRunner'))

export default function NativeApp({ launching }: { launching: boolean }) {
  const t = useT()
  const doc = usePdfStore((s) => s.doc)
  const loading = usePdfStore((s) => s.loading)
  const firstPaint = usePdfStore((s) => s.firstPaint)
  const lockedFile = usePdfStore((s) => s.lockedFile)
  const hasTabs = useTabStore((s) => s.tabs.length > 0)
  const tab = useNav((s) => s.tab)
  const screens = useNav((s) => s.screens)
  const sheet = useNav((s) => s.sheet)
  const plainPaper = usePhonePrefs((s) => s.plainPaper)

  const inDocument = !!doc || loading || hasTabs || !!lockedFile
  const top = inDocument ? topScreen(screens) : null
  // The knowledge base over the tabs (opened from Tune with no document open).
  const overTabs = !inDocument && isKnowledge(topScreen(screens))

  useDocumentChanges()
  useHistoryLayers(inDocument)
  useKeepAwake(!!doc)
  useShortcutRequests()
  useNoFocusZoom()
  useQrPage()
  useKnowledgeBaseRequests()

  // The clock and battery stay legible: light glyphs over the cobalt desk and
  // the moments, dark ones over paper.
  const darkTop = inDocument ? top === 'signed' || top === 'smaller' : tab === 'desk' && !overTabs
  useEffect(() => {
    void setStatusBarOverDarkChrome(darkTop)
  }, [darkTop])

  return (
    <div className={`np${plainPaper ? ' np--plain' : ''}`} style={{ background: 'var(--np-paper)' }}>
      <Suspense fallback={null}>
        <ShortcutRunner />
      </Suspense>

      {inDocument ? (
        <div className="flex-1 min-h-0 flex flex-col relative">
          {doc && <DocumentScreen />}
          {top && (
            <PageLayer swipeBack={hasBackLink(top) && !sheet}>
              {top === 'sign' && <SignScreen onDone={() => useNav.getState().pop()} />}
              {top === 'share' && <ShareScreen />}
              {top === 'signed' && <SignedMoment />}
              {top === 'smaller' && <SmallerMoment />}
              {top === 'qr' && <QrScreen />}
              {isKnowledge(top) && <KnowledgeScreen />}
            </PageLayer>
          )}
          {doc && sheet === 'more' && !top && <MoreSheet />}
          {(loading || (doc && !firstPaint)) && (
            <div className="absolute inset-0 z-[140] flex items-center justify-center text-[15px] text-[color:var(--np-muted)]" style={{ background: 'var(--np-grey-desk)' }}>
              {t('phone.opening')}
            </div>
          )}
        </div>
      ) : launching ? (
        <div className="flex-1" style={{ background: 'var(--np-paper)' }} />
      ) : (
        <>
          {tab === 'desk' && <DeskScreen />}
          {tab === 'signatures' && <SignaturesScreen />}
          {tab === 'tune' && <TuneScreen />}
          <TabBar />
          {overTabs && (
            <PageLayer swipeBack>
              <KnowledgeScreen />
            </PageLayer>
          )}
        </>
      )}

      <Toast />
      <SharedDialogs />
    </div>
  )
}

/**
 * A page over the document (or the knowledge base over the tabs). One with a
 * back link also goes back on a swipe in from the left edge, the way an
 * iPhone's pages do (James, 2026-10-19) — set up here, once, rather than on
 * each page. The Signed and Smaller moments have no way back, so no swipe;
 * nor while a sheet is open over the page.
 */
function PageLayer({ swipeBack, children }: { swipeBack: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEdgeSwipeBack(ref, swipeBack, () => useNav.getState().pop())
  return (
    <div ref={ref} className="absolute inset-0 z-[150] flex flex-col">
      {children}
    </div>
  )
}

/** The pages whose back link is `pop()`: every page but the two moments. */
function hasBackLink(screen: Screen): boolean {
  return screen !== 'signed' && screen !== 'smaller'
}

function TabBar() {
  const t = useT()
  const tab = useNav((s) => s.tab)
  const items: { id: Tab; label: string; icon: string }[] = [
    { id: 'desk', label: t('phone.tab_desk'), icon: PATHS.doc },
    { id: 'signatures', label: t('phone.tab_signatures'), icon: PATHS.sign },
    { id: 'tune', label: t('phone.tab_tune'), icon: PATHS.tune },
  ]
  return (
    <nav
      aria-label={t('phone.tabs_aria')}
      className="flex-none grid grid-cols-3 px-3 pt-2"
      style={{ background: 'var(--np-slip)', borderTop: '1px solid var(--np-line)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}
    >
      {items.map((it) => {
        const on = tab === it.id
        return (
          <button
            key={it.id}
            type="button"
            aria-current={on ? 'page' : undefined}
            onClick={() => {
              // Desk tapped while on it opens the desk's search, keyboard up:
              // requestSearch is synchronous, so the focus lands inside this tap.
              if (on && it.id === 'desk') requestSearch()
              useNav.getState().setTab(it.id)
            }}
            className="flex flex-col items-center gap-1.5 min-h-[48px]"
            style={{ color: on ? 'var(--np-cobalt-deep)' : 'var(--np-muted)' }}
          >
            <span className="relative w-[52px] h-[30px] rounded-xl flex items-center justify-center" style={{ background: on ? 'var(--np-cobalt)' : 'transparent' }}>
              <Icon d={it.icon} size={22} stroke={on ? '#ffffff' : 'currentColor'} />
              {on && (
                <span aria-hidden="true" className="absolute left-2.5 right-2.5 -bottom-1.5 h-1 rounded-[2px_4px_3px_2px]" style={{ background: 'var(--np-orange)', transform: 'rotate(-3deg)' }} />
              )}
            </span>
            <span className="text-[11px]" style={{ fontWeight: on ? 700 : 600 }}>{it.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function Toast() {
  const toast = useNav((s) => s.toast)
  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => useNav.getState().dismissToast(), 3200)
    return () => window.clearTimeout(id)
  }, [toast])
  if (!toast) return null
  return (
    <div className="absolute left-0 right-0 z-[400] flex justify-center px-6 pointer-events-none" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 110px)' }}>
      <div
        role="status"
        className="np-moment-enter max-w-[340px] px-4 py-2.5 rounded-2xl text-[14px] leading-snug text-white text-center pointer-events-auto"
        style={{ background: 'rgba(27,29,34,0.92)', boxShadow: '0 8px 20px rgba(0,0,0,0.25)' }}
        onClick={() => useNav.getState().dismissToast()}
      >
        {toast}
      </div>
    </div>
  )
}

/** The website's dialogs the phone still opens, plus the jobs' borrowed ones. */
function SharedDialogs() {
  const stampPickerOpen = useSignatureStore((s) => s.stampPickerOpen)
  const sendForSignatureOpen = usePdfStore((s) => s.sendForSignatureOpen)
  const ocrOpen = usePdfStore((s) => s.ocrOpen)
  const mergeOpen = usePdfStore((s) => s.mergeOpen)
  const convertOpen = usePdfStore((s) => s.convertOpen)
  const compareOpen = usePdfStore((s) => s.compareOpen)
  const sourceBytes = usePdfStore((s) => s.sourceBytes)
  const fileName = usePdfStore((s) => s.fileName)
  const dialog = useJobs((s) => s.dialog)
  const pdf = usePdfStore.getState()
  const closeJob = () => useJobs.getState().setDialog(null)
  const currentFile = () =>
    sourceBytes && fileName ? new File([sourceBytes.slice(0)], fileName, { type: 'application/pdf' }) : null
  const openResult = (file: File) => {
    void usePdfStore.getState().loadFile(file)
  }

  return (
    <>
      <PageNavigator />
      <SignaturePad />
      <SignatureImport />
      <Suspense fallback={null}>
        {stampPickerOpen && <StampPicker />}
        {sendForSignatureOpen && <SendForSignatureDialog />}
        {ocrOpen && sourceBytes && (
          <OcrModal sourceBytes={sourceBytes} fileName={fileName ?? 'document.pdf'} onClose={() => pdf.setOcrOpen(false)} onOpen={openResult} />
        )}
        {mergeOpen && <MergeDialog initialFile={currentFile()} onClose={() => pdf.setMergeOpen(false)} />}
        {convertOpen && <ConvertDialog initialMode="pdf-to-images" initialPdf={currentFile()} onClose={() => pdf.setConvertOpen(false)} />}
        {compareOpen && sourceBytes && (
          <CompareDialog firstBytes={sourceBytes} firstName={fileName ?? 'document.pdf'} onClose={() => pdf.setCompareOpen(false)} />
        )}

        {dialog?.kind === 'scan' && <ScanDialog source={dialog.source} initialPages={dialog.pages} onClose={closeJob} />}
        {dialog?.kind === 'merge' && <MergeDialog initialFile={dialog.initialFile ?? null} onClose={closeJob} />}
        {dialog?.kind === 'convert' && <ConvertDialog initialMode={dialog.mode} initialPdf={dialog.initialPdf ?? null} onClose={closeJob} />}
        {dialog?.kind === 'ocr' && (
          <OcrModal
            sourceBytes={dialog.bytes}
            fileName={dialog.name}
            onClose={closeJob}
            onOpen={(file) => {
              closeJob()
              openResult(file)
            }}
          />
        )}
        {dialog?.kind === 'compare' && <CompareDialog firstBytes={dialog.bytes} firstName={dialog.name} onClose={closeJob} />}
      </Suspense>
      <UnsavedChangesDialog />
      <LockedFilePrompt />
    </>
  )
}

/** Pages belong to the document they were opened on. */
function useDocumentChanges() {
  const doc = usePdfStore((s) => s.doc)
  const prev = useRef(doc)
  useEffect(() => {
    const was = prev.current
    prev.current = doc
    // Closed: back to the tabs. Another document came to the front (from the
    // share sheet, say): it starts on its own pages. Opening one from the desk
    // (null → doc) keeps whatever the job pushed on top of it.
    if (!doc || (was && was !== doc)) useNav.getState().clearScreens()
    // One arrived (the share sheet) while the knowledge base was over the tabs.
    else if (!was) useNav.getState().dropKnowledge()
  }, [doc])
}

/**
 * Every layer — the open document, each page on it, a sheet — is one entry in
 * the browser history, so Android's back gesture (Capacitor's default is
 * `history.back()` while there is history) closes the top one, and so does the
 * browser's Back in development.
 *
 * Kept by counting rather than by state objects: pdfStore rewrites the current
 * entry with `replaceState(null)` whenever the document's slug changes, which
 * would wipe anything stored on it.
 */
function useHistoryLayers(inDocument: boolean) {
  const screens = useNav((s) => s.screens)
  const sheet = useNav((s) => s.sheet)
  const pushed = useRef(0)
  const ignore = useRef(0)
  // With no document, only the knowledge base's pages stand over the tabs.
  const wanted = inDocument ? 1 + screens.length + (sheet ? 1 : 0) : screens.filter(isKnowledge).length

  useEffect(() => {
    if (wanted > pushed.current) {
      for (let i = pushed.current; i < wanted; i++) history.pushState({ np: i + 1 }, '')
      pushed.current = wanted
    } else if (wanted < pushed.current) {
      // Closed from a button: take our own entries back off, quietly.
      const n = pushed.current - wanted
      ignore.current += n
      pushed.current = wanted
      history.go(-n)
    }
  }, [wanted])

  useEffect(() => {
    function onPop() {
      if (ignore.current > 0) {
        ignore.current--
        return
      }
      if (pushed.current === 0) return
      pushed.current--
      const nav = useNav.getState()
      if (nav.sheet) nav.closeSheet()
      else if (nav.screens.length) nav.pop()
      else if (usePdfStore.getState().doc || useTabStore.getState().tabs.length) {
        // Leaving asks first when there is unsaved work; if the answer is
        // "stay", the document's entry is pushed again by the effect above.
        leaveDocument()
        queueMicrotask(() => {
          const still = !!usePdfStore.getState().doc
          if (still && pushed.current === 0) {
            history.pushState({ np: 1 }, '')
            pushed.current = 1
          }
        })
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
}

/**
 * A QR code is a page here, like Sign (James, 2026-10-18), not the website's
 * dialog: whatever asks for the QR editor — Mark up's QR code, the ✏️ on a
 * placed code, a double-tap on one — opens the page. It ends the request
 * itself when it closes (QrScreen).
 */
function useQrPage() {
  const qrOpen = usePdfStore((s) => s.qrOpen)
  useEffect(() => {
    if (!qrOpen) return
    const nav = useNav.getState()
    if (topScreen(nav.screens) !== 'qr') nav.push('qr')
  }, [qrOpen])
}

/**
 * iOS zooms the whole web view in on any box being typed in whose words are
 * smaller than 16px — a sticky note, a text box, a form field at phone zoom —
 * and never zooms back out, so the header and the sheet's ends were left off
 * the screen (James, 2026-10-18). `maximum-scale=1` stops that zoom. The
 * phone screens never want the web view itself zoomed: the viewer does its
 * own pinch (PdfViewer), so nothing is lost. The website keeps its own tag.
 */
function useNoFocusZoom() {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
    if (!meta) return
    const before = meta.content
    if (!/maximum-scale/.test(before)) meta.content = `${before}, maximum-scale=1`
    return () => {
      meta.content = before
    }
  }, [])
}

/** Tune ▸ Keep the screen awake, while a document is open. */
function useKeepAwake(docOpen: boolean) {
  const keepAwake = usePhonePrefs((s) => s.keepAwake)
  useEffect(() => {
    if (!docOpen || !keepAwake || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let live = true
    const take = () => {
      if (document.visibilityState !== 'visible') return
      void navigator.wakeLock
        .request('screen')
        .then((l) => {
          if (live) lock = l
          else void l.release()
        })
        .catch(() => {})
    }
    take()
    document.addEventListener('visibilitychange', take)
    return () => {
      live = false
      document.removeEventListener('visibilitychange', take)
      void lock?.release()
    }
  }, [docOpen, keepAwake])
}

/**
 * Shortcuts and the share sheet ("Make a PDF smaller", "Sign a PDF" — see
 * lib/appActions.ts) open the file, then ask for a tool. On the website the
 * toolbar takes the request; here it becomes the Smaller moment or the Sign page.
 */
function useShortcutRequests() {
  const request = useShortcutStore((s) => s.request)
  const doc = usePdfStore((s) => s.doc)
  useEffect(() => {
    if (!request || !doc) return
    const store = useShortcutStore.getState()
    if (store.take('export')) useNav.getState().push('smaller')
    else if (store.take('sign')) useNav.getState().push('sign')
  }, [request, doc])
}
