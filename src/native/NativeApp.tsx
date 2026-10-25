import { lazy, Suspense, useEffect, useRef } from 'react'
import { configurePhoneLayers, PhoneDialogHost, requestSearch, useEdgeSwipeBack, usePagePullToType, usePhoneLayer } from '@unisim/sdk'
import { useT } from '../i18n'
import { usePdfStore } from '../stores/pdfStore'
import { useSignatureStore } from '../stores/signatureStore'
import { useTabStore } from '../stores/tabStore'
import { useShortcutStore } from '../stores/shortcutStore'
import { setStatusBarOverDarkChrome } from '../lib/nativeOpen'
import UnsavedChangesDialog from '../components/Exit/UnsavedChangesDialog'
import type { ScanPage } from '../lib/scan'
import { Icon, PATHS } from './icons'
import { goBack, isJobPage, isKnowledge, overTabs as canStandOverTabs, topScreen, useNav, type Screen, type Tab } from './nav'
import { FitLabel } from './parts'
import { currentFile, openJob, useJobs } from './jobs'
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
import ScanScreen from './ScanScreen'
import MergeScreen from './MergeScreen'
import PhotosScreen from './PhotosScreen'
import OcrScreen from './OcrScreen'
import CompareScreen from './CompareScreen'
import PagesScreen from './PagesScreen'
import SendSignSheet from './SendSignSheet'
import { LockedSheet, usePhonePrompts } from './Prompts'
import { BlackedMoment, SentMoment, SignedMoment, SmallerMoment } from './Moments'
import './native.css'

// The phone app's screens (see shell.ts for when they are used). Three tabs
// with no document open; with one open, the document, with pages and sheets
// stacked over it. The document screen stays mounted under its pages so the
// viewer keeps its place, zoom and work while Sign or Share is on top.
//
// No website dialog is left on the phone (the mobile-first pass, 2026-10-22):
// Scan, Merge, Photos, OCR, Compare and the pages are pages of their own, Send
// to sign and a locked file's password are sheets, and the shared code's
// alert/prompt calls come here through lib/notice (Prompts.tsx). App.tsx
// returns this tree in place of its own, so nothing of App's render reaches
// the phone. Requests the shared code still makes through the website's store
// flags (the ✏️ on a Sign here box, Siri's Scan…) are turned into pages here.

// Every layer — the open document, each page on it, each sheet — is on the
// SDK's phone layer stack (`usePhoneLayer`), which keeps one browser history
// entry per layer, so Android's back gesture (Capacitor goes `history.back()`
// while there is history) closes the top one, and so does the browser's Back
// in development. Kept by counting, which matters here: pdfStore rewrites the
// current entry with `replaceState(null)` whenever the document's slug
// changes. ⚠️ The kit's sheets stack from z 1200 by default; here they are
// rendered inside `.np` (Sheet in parts.tsx) and start at 200, over the pages
// (150) and the opening veil (140) and under the toast (400), where PDF's own
// sheets always were.
configurePhoneLayers({ baseZ: 200 })

const ShortcutRunner = lazy(() => import('../components/Shortcuts/ShortcutRunner'))
const onShortcutScan = (pages: ScanPage[]) => openJob({ kind: 'scan', source: 'camera', pages })

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
  const deskSearching = useNav((s) => s.deskSearching)

  const inDocument = !!doc || loading || hasTabs || !!lockedFile
  const top = inDocument ? topScreen(screens) : null
  // A page over the tabs: the knowledge base (from Tune) or a job's page (from
  // the Desk), with no document open.
  const tabTop = !inDocument ? topScreen(screens) : null
  const overTabs = canStandOverTabs(tabTop)

  usePhonePrompts()
  useWebsiteRequests()
  useJobHandOff()
  useDocumentChanges()
  useKeepAwake(!!doc)
  useShortcutRequests()
  useNoFocusZoom()
  useQrPage()
  useKnowledgeBaseRequests()

  // The clock and battery stay legible: light glyphs over the cobalt desk and
  // the moments, dark ones over paper.
  const darkTop = inDocument ? isMoment(top) : tab === 'desk' && !overTabs && !deskSearching
  useEffect(() => {
    void setStatusBarOverDarkChrome(darkTop)
  }, [darkTop])

  return (
    <div className={`np${plainPaper ? ' np--plain' : ''}`} style={{ background: 'var(--np-paper)' }}>
      <Suspense fallback={null}>
        <ShortcutRunner onScan={onShortcutScan} />
      </Suspense>

      {inDocument ? (
        <div className="flex-1 min-h-0 flex flex-col relative">
          {/* First, so it is the bottom of the stack: a page or sheet that
              mounts in the same commit registers after it. */}
          <DocumentLayer />
          {doc && <DocumentScreen />}
          {top && (
            <PageLayer swipeBack={hasBackLink(top)}>
              {top === 'sign' && <SignScreen onDone={() => useNav.getState().pop()} />}
              {top === 'share' && <ShareScreen />}
              {top === 'signed' && <SignedMoment />}
              {top === 'smaller' && <SmallerMoment />}
              {top === 'blacked' && <BlackedMoment />}
              {top === 'sent' && <SentMoment />}
              {top === 'qr' && <QrScreen />}
              {top === 'pages' && <PagesScreen />}
              <JobPages top={top} />
            </PageLayer>
          )}
          {doc && sheet === 'more' && !top && <MoreSheet />}
          {doc && sheet === 'send-sign' && !top && <SendSignSheet />}
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
              <JobPages top={tabTop} />
            </PageLayer>
          )}
        </>
      )}

      <Toast />
      <LockedSheet />
      {/* The shared code's one-line questions (Prompts.tsx), as the kit's sheet. */}
      <PhoneDialogHost theme="light" />
      {/* Kept in case anything still asks before leaving a document; nothing
          on the phone does (leaving keeps the work, DocumentScreen). */}
      <UnsavedChangesDialog />
    </div>
  )
}

/** The pages that can stand over the document or over the tabs. */
function JobPages({ top }: { top: Screen | null }) {
  return (
    <>
      {isKnowledge(top) && <KnowledgeScreen />}
      {top === 'scan' && <ScanScreen />}
      {top === 'merge' && <MergeScreen />}
      {top === 'photos' && <PhotosScreen />}
      {top === 'ocr' && <OcrScreen />}
      {top === 'compare' && <CompareScreen />}
    </>
  )
}

/** The four moments: the cobalt desk, light status-bar glyphs, and no way back but their buttons. */
function isMoment(screen: Screen | null): boolean {
  return screen === 'signed' || screen === 'smaller' || screen === 'blacked' || screen === 'sent'
}

/**
 * The open document, as the bottom layer: Back with nothing over it leaves the
 * document for the desk (keeping the work — see leaveDocument). Still open a
 * tick later (still loading), the kit keeps its history entry for the next Back.
 */
function DocumentLayer() {
  usePhoneLayer('page', () => {
    if (usePdfStore.getState().doc || useTabStore.getState().tabs.length) leaveDocument()
    return usePdfStore.getState().doc ? false : undefined
  })
  return null
}

/**
 * A page over the document (or the knowledge base over the tabs). One with a
 * back link also goes back on a swipe in from the left edge, the way an
 * iPhone's pages do (James, 2026-10-19) — set up here, once, rather than on
 * each page. The Signed and Smaller moments have no way back, so no swipe;
 * nor while a sheet is open over the page (it is not the top layer then).
 *
 * ONE layer for the stack of pages: only the top page is mounted, and a page
 * popped with another under it leaves this layer open, so the kit pushes its
 * history entry again for the next Back. `goBack()` answers false for a page
 * that asks first (Scan), which keeps it.
 */
function PageLayer({ swipeBack, children }: { swipeBack: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const { isTop } = usePhoneLayer('page', () => goBack())
  useEdgeSwipeBack(ref, swipeBack && isTop, () => void goBack())
  usePagePullToType(ref)
  return (
    <div ref={ref} className="absolute inset-0 z-[150] flex flex-col">
      {children}
    </div>
  )
}

/** The pages whose back link is `pop()`: every page but the moments. */
function hasBackLink(screen: Screen): boolean {
  return !isMoment(screen)
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
            className="min-w-0 flex flex-col items-center gap-1.5 min-h-[48px]"
            style={{ color: on ? 'var(--np-cobalt-deep)' : 'var(--np-muted)' }}
          >
            <span className="relative w-[52px] h-[30px] rounded-xl flex items-center justify-center" style={{ background: on ? 'var(--np-cobalt)' : 'transparent' }}>
              <Icon d={it.icon} size={22} stroke={on ? '#ffffff' : 'currentColor'} />
              {on && (
                <span aria-hidden="true" className="absolute left-2.5 right-2.5 -bottom-1.5 h-1 rounded-[2px_4px_3px_2px]" style={{ background: 'var(--np-orange)', transform: 'rotate(-3deg)' }} />
              )}
            </span>
            <FitLabel size={11} className={on ? 'font-bold' : 'font-semibold'}>{it.label}</FitLabel>
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

/**
 * The shared code (the viewer, the pages' own buttons, Siri) still asks for
 * the website's dialogs through pdfStore and signatureStore flags. On the
 * phone each becomes a page or a sheet, and the flag is put down again.
 */
function useWebsiteRequests() {
  const pageNavOpen = usePdfStore((s) => s.pageNavOpen)
  const ocrOpen = usePdfStore((s) => s.ocrOpen)
  const mergeOpen = usePdfStore((s) => s.mergeOpen)
  const convertOpen = usePdfStore((s) => s.convertOpen)
  const compareOpen = usePdfStore((s) => s.compareOpen)
  const sendForSignatureOpen = usePdfStore((s) => s.sendForSignatureOpen)
  const padOpen = useSignatureStore((s) => s.padOpen)
  const importOpen = useSignatureStore((s) => s.importOpen)

  useEffect(() => {
    const pdf = usePdfStore.getState()
    const nav = useNav.getState()
    if (pageNavOpen) {
      pdf.setPageNavOpen(false)
      if (pdf.doc && topScreen(nav.screens) !== 'pages') nav.push('pages')
    }
    if (sendForSignatureOpen) {
      // The ✏️ "Send" beside a Sign here box on the page.
      pdf.setSendForSignatureOpen(false)
      if (pdf.doc) nav.openSheet('send-sign')
    }
    const file = currentFile()
    if (ocrOpen) {
      pdf.setOcrOpen(false)
      if (pdf.sourceBytes && file) openJob({ kind: 'ocr', bytes: pdf.sourceBytes.slice(0), name: file.name })
    }
    if (compareOpen) {
      pdf.setCompareOpen(false)
      if (pdf.sourceBytes && file) openJob({ kind: 'compare', bytes: pdf.sourceBytes.slice(0), name: file.name })
    }
    if (mergeOpen) {
      pdf.setMergeOpen(false)
      openJob({ kind: 'merge', initialFile: file })
    }
    if (convertOpen) {
      pdf.setConvertOpen(false)
      openJob({ kind: 'convert', mode: 'pdf-to-images', initialPdf: file })
    }
  }, [pageNavOpen, ocrOpen, mergeOpen, convertOpen, compareOpen, sendForSignatureOpen])

  // A tap on a Sign here box (startSigningField) asks for the website's pad:
  // here it is the Sign page, which fills that box (SignScreen reads
  // `signingFieldId`). The photo importer is the Sign page's own Photo tab.
  useEffect(() => {
    if (!padOpen && !importOpen) return
    const sig = useSignatureStore.getState()
    if (importOpen) sig.closeImport()
    const nav = useNav.getState()
    if (usePdfStore.getState().doc && topScreen(nav.screens) !== 'sign') nav.push('sign')
    else if (!usePdfStore.getState().doc) sig.closePad()
  }, [padOpen, importOpen])
}

/**
 * A job page reads what it starts with from `useJobs.dialog`; once no job
 * page is left on the stack (by any road: back, a swipe, Android's back, the
 * result opening), that is put down. Done here rather than as each page
 * unmounts, which development's double mount would trip over.
 */
function useJobHandOff() {
  const anyJob = useNav((s) => s.screens.some(isJobPage))
  useEffect(() => {
    if (!anyJob) useJobs.getState().setDialog(null)
  }, [anyJob])
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
