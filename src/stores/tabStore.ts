import { create } from 'zustand'
import { usePdfStore, setHashSlug, readHashSlug, openDocumentOffscreen } from './pdfStore'
import { useAnnotationStore } from './annotationStore'
import { useFormStore, type FormFieldValue } from './formStore'
import { useSearchStore } from './searchStore'
import { useSignatureStore } from './signatureStore'
import { useExitGuard, type ExitIntent } from './exitGuard'
import {
  captureSavedBaseline,
  hasUnsavedChanges,
  isAmended,
  restoreSavedBaseline,
  type SavedBaseline
} from '../lib/unsavedChanges'
import { captureView, restoreViewFor, type ViewState } from '../lib/viewMemory'
import { OfficeImportError, toViewablePdf } from '../lib/officeToPdf'
import type { PDFDocumentProxy } from '../lib/pdfjs'
import type { Annotation } from '../types/annotations'
import { getT } from '../i18n'

// Several PDFs in one window, one tab each (James, 2026-09-14: "If the user
// drops multiple PDFs in, or opens multiple PDFs on Windows / Mac with open
// with... then introduce tabs to easily switch between them").
//
// ⚠️ THE STORES STAY SINGLE-DOCUMENT, AND THAT IS THE DESIGN. Every component in
// the app reads "the" document out of `pdfStore`, `annotationStore` and
// `formStore`; teaching all of them about tabs would touch everything. Instead
// the tab on screen lives in those stores exactly as a lone document always
// has, and every OTHER tab is a snapshot held here. Switching tabs puts the
// outgoing tab's state into a snapshot and the incoming one's back into the
// stores, so nothing downstream can tell a tab from a document.
//
// ⚠️ NO TABS IS THE ORDINARY STATE. `tabs` stays empty while one document is
// open — every path that opens, closes or replaces a single document works as
// it did before this file existed. The list comes into being only when a
// second document arrives, and collapses back to empty when the second-to-last
// tab closes, so there is never a strip with one tab in it.
//
// What a snapshot does NOT carry, deliberately: the find bar (its matches were
// worked out for one document's text, and it is cheap to search again), the
// selection, an armed picture or signature piece, and any open dialog. Every
// one of those is about what you were doing a moment ago on the page you are
// leaving, and none of them makes sense arriving on a different one.

type PdfLive = ReturnType<typeof usePdfStore.getState>

interface TabSnapshot {
  doc: PDFDocumentProxy | null
  numPages: number
  fileName: string | null
  sourceBytes: ArrayBuffer | null
  isXfa: boolean
  importNotice: string | null
  lockedFile: PdfLive['lockedFile']
  docUndo: PdfLive['docUndo']
  annotations: Annotation[]
  past: Annotation[][]
  future: Annotation[][]
  formValues: FormFieldValue[]
  baseline: SavedBaseline
  slug: string | null
  view: ViewState | null
}

export interface DocTab {
  id: string
  /** The file's name when it was opened — the label until the tab has a document of its own. */
  name: string
  /** Null for the tab on screen, whose state is in the live stores. */
  snapshot: TabSnapshot | null
}

interface TabState {
  tabs: DocTab[]
  activeId: string | null
}

export const useTabStore = create<TabState>(() => ({ tabs: [], activeId: null }))

let seq = 0
const newTabId = () => `tab-${Date.now().toString(36)}-${++seq}`

// Set while this module is itself rewriting the live stores, so the watcher
// below does not mistake the gap between two documents for a tab being closed.
let switching = false

// Whatever the dialogs were doing belonged to the tab being left.
const CLOSED_DIALOGS = {
  previewOpen: false,
  presentOpen: false,
  hostedStoreOpen: false,
  sendToSignOpen: false,
  ocrOpen: false,
  mergeOpen: false,
  convertOpen: false,
  advancedExportOpen: false,
  metadataOpen: false,
  qrOpen: false,
  qrEdit: null
} as const

/** Is anything on screen — a document, a password prompt, or one on its way? */
function liveHasDocument(): boolean {
  const s = usePdfStore.getState()
  return !!s.doc || !!s.lockedFile || s.loading
}

function captureLive(): TabSnapshot {
  // First, while the outgoing document's pages are still laid out.
  const view = captureView()
  const pdf = usePdfStore.getState()
  const ann = useAnnotationStore.getState()
  return {
    doc: pdf.doc,
    numPages: pdf.numPages,
    fileName: pdf.fileName,
    sourceBytes: pdf.sourceBytes,
    isXfa: pdf.isXfa,
    importNotice: pdf.importNotice,
    lockedFile: pdf.lockedFile,
    docUndo: pdf.docUndo,
    annotations: ann.annotations,
    past: ann.past,
    future: ann.future,
    formValues: useFormStore.getState().values,
    baseline: captureSavedBaseline(),
    slug: readHashSlug(),
    view
  }
}

function applyLive(snap: TabSnapshot) {
  if (snap.doc && snap.view) restoreViewFor(snap.doc, snap.view)
  // ⚠️ The document first, the edits after. The recents auto-save pairs the
  // CURRENT file name with each annotation change it sees, so setting the
  // annotations while the old name was still live would file one tab's marks
  // under the other tab's document.
  usePdfStore.setState({
    doc: snap.doc,
    numPages: snap.numPages,
    fileName: snap.fileName,
    sourceBytes: snap.sourceBytes,
    isXfa: snap.isXfa,
    importNotice: snap.importNotice,
    lockedFile: snap.lockedFile,
    docUndo: snap.docUndo,
    loading: false,
    // Already drawn once; there is no first paint to hold the placeholder for.
    firstPaint: true,
    ...CLOSED_DIALOGS
  })
  useAnnotationStore.setState({
    annotations: snap.annotations,
    past: snap.past,
    future: snap.future,
    selectedId: null,
    selectedIds: [],
    uploadedImageSrc: null,
    uploadedImageQr: null
  })
  useFormStore.setState({ values: snap.formValues })
  useSearchStore.getState().reset()
  useSignatureStore.getState().setPendingExtras([])
  restoreSavedBaseline(snap.baseline)
  setHashSlug(snap.slug)
}

// The stores emptied and marked as loading, WITHOUT destroying the document
// that was in them — it now belongs to a snapshot. `reset()` would free it.
function blankLiveForLoading() {
  usePdfStore.setState({
    doc: null,
    numPages: 0,
    fileName: null,
    sourceBytes: null,
    isXfa: false,
    importNotice: null,
    lockedFile: null,
    docUndo: [],
    loading: true,
    firstPaint: true,
    ...CLOSED_DIALOGS
  })
  useAnnotationStore.getState().resetDocument()
  useFormStore.getState().clearAll()
  useSearchStore.getState().reset()
  useSignatureStore.getState().setPendingExtras([])
  setHashSlug(null)
}

function liveLabel(): string {
  const s = usePdfStore.getState()
  return s.fileName ?? s.lockedFile?.file.name ?? 'document.pdf'
}

// The lone document becomes the first tab, so a second one can join it.
function ensureTabs() {
  if (useTabStore.getState().tabs.length > 0) return
  const id = newTabId()
  useTabStore.setState({ tabs: [{ id, name: liveLabel(), snapshot: null }], activeId: id })
}

/** Bring a background tab forward. A no-op mid-load, so a document still
 *  arriving can never land in the tab that replaced it on screen. */
export function activateTab(id: string) {
  const { tabs, activeId } = useTabStore.getState()
  if (id === activeId || usePdfStore.getState().loading) return
  const target = tabs.find((t) => t.id === id)
  if (!target?.snapshot) return
  const outgoing = captureLive()
  switching = true
  try {
    useTabStore.setState({
      tabs: tabs.map((t) =>
        t.id === activeId ? { ...t, snapshot: outgoing } : t.id === id ? { ...t, snapshot: null } : t
      ),
      activeId: id
    })
    applyLive(target.snapshot)
  } finally {
    switching = false
  }
}

/** The tab `step` places along from the one on screen, wrapping at the ends. */
export function cycleTab(step: 1 | -1) {
  const { tabs, activeId } = useTabStore.getState()
  if (tabs.length < 2) return
  const i = tabs.findIndex((t) => t.id === activeId)
  activateTab(tabs[(i + step + tabs.length) % tabs.length].id)
}

async function openInNewActiveTab(file: File, notice?: string) {
  ensureTabs()
  const { tabs, activeId } = useTabStore.getState()
  const outgoing = captureLive()
  const id = newTabId()
  const next = tabs.map((t) => (t.id === activeId ? { ...t, snapshot: outgoing } : t))
  // Beside the tab it was opened from, as a browser does.
  next.splice(tabs.findIndex((t) => t.id === activeId) + 1, 0, { id, name: file.name, snapshot: null })
  switching = true
  try {
    useTabStore.setState({ tabs: next, activeId: id })
    blankLiveForLoading()
  } finally {
    switching = false
  }
  // A failure here leaves the new tab empty, and the watcher below closes it
  // and brings back the tab it was opened from. The caller reports the error.
  await usePdfStore.getState().loadFile(file, { notice })
}

async function openInBackgroundTab(file: File, notice?: string) {
  const opened = await openDocumentOffscreen(file, { notice })
  // The same array in both places: "amended" is decided by identity.
  const formValues: FormFieldValue[] = []
  const snapshot: TabSnapshot = {
    doc: opened.doc,
    numPages: opened.numPages,
    fileName: opened.fileName,
    sourceBytes: opened.sourceBytes,
    isXfa: opened.isXfa,
    importNotice: opened.importNotice,
    lockedFile: opened.lockedFile,
    docUndo: [],
    annotations: opened.annotations,
    past: [],
    future: [],
    formValues,
    baseline: { annotations: opened.annotations, formValues, structuralEdits: 0, savedStructuralEdits: 0 },
    slug: null,
    view: null
  }
  // Everything was closed while this one was being read — it is the only
  // document now, so it simply goes on screen.
  if (!liveHasDocument() && useTabStore.getState().tabs.length === 0) {
    switching = true
    try {
      applyLive(snapshot)
    } finally {
      switching = false
    }
    void opened.slug.then((slug) => {
      if (usePdfStore.getState().doc === opened.doc && slug) setHashSlug(slug)
    })
    return
  }
  ensureTabs()
  const id = newTabId()
  useTabStore.setState((s) => ({ tabs: [...s.tabs, { id, name: file.name, snapshot }] }))
  // IndexedDB answers after the tab exists. Written into whichever copy of the
  // tab's state is current by then: its snapshot, or the address bar if it has
  // already been brought forward.
  void opened.slug.then((slug) => {
    if (!slug) return
    const { tabs, activeId } = useTabStore.getState()
    const tab = tabs.find((t) => t.id === id)
    if (tab?.snapshot) tab.snapshot.slug = slug
    else if (activeId === id) setHashSlug(slug)
  })
}

// ⚠️ A tab left with nothing in it is closed, whichever way it got there:
// Actions → File → Close PDF (which calls `reset()`), a document that failed to
// load into a new tab, or a password prompt cancelled. One watcher rather than a
// tab-aware copy of each of those paths, which would miss the next one added.
//
// A microtask later, not in the listener itself: `reset()` still has its own
// bookkeeping to finish after the store update (it clears the address bar),
// and would otherwise do it on top of the tab this brings forward.
usePdfStore.subscribe((s) => {
  if (switching || s.doc || s.lockedFile || s.loading) return
  if (useTabStore.getState().tabs.length < 2) return
  queueMicrotask(dropEmptyActiveTab)
})

function dropEmptyActiveTab() {
  if (switching || liveHasDocument()) return
  const { tabs, activeId } = useTabStore.getState()
  if (tabs.length < 2) return
  const index = tabs.findIndex((t) => t.id === activeId)
  const remaining = tabs.filter((t) => t.id !== activeId)
  // The tab to the right takes its place, or the one to the left at the end.
  const next = remaining[Math.min(Math.max(index, 0), remaining.length - 1)]
  if (!next.snapshot) return
  switching = true
  try {
    useTabStore.setState(
      remaining.length === 1
        ? { tabs: [], activeId: null }
        : {
            tabs: remaining.map((t) => (t.id === next.id ? { ...t, snapshot: null } : t)),
            activeId: next.id
          }
    )
    applyLive(next.snapshot)
  } finally {
    switching = false
  }
}

function snapshotAmended(snap: TabSnapshot): boolean {
  return !!snap.doc && isAmended(snap.baseline, snap.annotations, snap.formValues)
}

/** Does this tab hold amendments that no saved file contains? */
export function tabIsAmended(tab: DocTab): boolean {
  if (tab.snapshot) return snapshotAmended(tab.snapshot)
  return !!usePdfStore.getState().doc && hasUnsavedChanges()
}

/** Is there anything, in any tab of this window, that closing it would lose? */
export function anyDocumentAmended(): boolean {
  const { tabs } = useTabStore.getState()
  if (tabs.length === 0) return !!usePdfStore.getState().doc && hasUnsavedChanges()
  return tabs.some(tabIsAmended)
}

/**
 * Close one tab. An amended tab is brought forward first, so the question
 * about saving it is asked with it on screen — "Save and exit" saves the
 * document you are looking at.
 */
export function closeTab(id: string) {
  const { tabs, activeId } = useTabStore.getState()
  const requestExit = useExitGuard.getState().requestExit
  const closeActive = () => usePdfStore.getState().reset()
  if (id === activeId) {
    if (usePdfStore.getState().loading) return
    requestExit('close-tab', closeActive)
    return
  }
  const tab = tabs.find((t) => t.id === id)
  if (!tab?.snapshot) return
  if (snapshotAmended(tab.snapshot)) {
    activateTab(id)
    if (useTabStore.getState().activeId === id) requestExit('close-tab', closeActive)
    return
  }
  tab.snapshot.doc?.destroy()
  const remaining = tabs.filter((t) => t.id !== id)
  useTabStore.setState(remaining.length === 1 ? { tabs: [], activeId: null } : { tabs: remaining })
}

/**
 * Leave every document in the window — the desktop window's × and ⌘Q. Each
 * amended tab is brought forward and asked about in turn; `done` runs once all
 * of them have been answered. A Cancel on any of them stops the whole thing,
 * with every tab still open.
 */
export function exitEveryDocument(intent: ExitIntent, done: () => void) {
  const requestExit = useExitGuard.getState().requestExit
  const answered = new Set<string>()
  const step = () => {
    const { tabs } = useTabStore.getState()
    if (tabs.length === 0) {
      requestExit(intent, done)
      return
    }
    const next = tabs.find((t) => !answered.has(t.id) && tabIsAmended(t))
    if (!next) {
      done()
      return
    }
    answered.add(next.id)
    activateTab(next.id)
    requestExit(intent, step)
  }
  step()
}

// Every open goes through one queue. Two drops in quick succession, or a batch
// of files arriving from the OS one message at a time, would otherwise race
// each other for the live stores.
let queue: Promise<unknown> = Promise.resolve()
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job)
  queue = run.catch(() => {})
  return run
}

/**
 * Open files the user chose together — dropped, picked, or handed over by an
 * installed web app. The first goes on screen; the rest open as tabs behind it.
 *
 * With nothing open, the first simply becomes the document, exactly as a
 * single file always has. With a document already open it gets a new tab
 * rather than replacing it — nothing is thrown away, so there is nothing to
 * ask about.
 *
 * Word and OpenDocument files are converted on the way through. Resolves to
 * whether anything went on screen.
 */
export function openFiles(files: File[]): Promise<boolean> {
  return enqueue(async () => {
    const failures: { name: string; message: string | null }[] = []
    let shown = false
    for (const raw of files) {
      try {
        const { file, notice } = await toViewablePdf(raw)
        if (shown) await openInBackgroundTab(file, notice)
        else if (liveHasDocument()) await openInNewActiveTab(file, notice)
        else await usePdfStore.getState().loadFile(file, { notice })
        shown = true
      } catch (err) {
        console.error(err)
        failures.push({ name: raw.name, message: err instanceof OfficeImportError ? err.message : null })
      }
    }
    if (failures.length === 1 && files.length === 1) {
      alert(failures[0].message ?? getT()('lib.open_failed'))
    } else if (failures.length > 0) {
      alert(
        `${getT()(failures.length === files.length ? 'lib.open_failed_all' : 'lib.open_failed_some')}\n\n` +
          failures.map((f) => `• ${f.name}${f.message ? ` — ${f.message}` : ''}`).join('\n')
      )
    }
    return shown
  })
}

/**
 * A document handed over by the desktop shell, one message per file. The shell
 * only sends a file to a window that already has a document when it arrived in
 * the same batch as that document (several opened together), so here it joins
 * it as a background tab; to an empty window it is simply the document.
 *
 * ⚠️ Through the same front door as a drop: a Word or OpenDocument file is
 * converted first, and a .doc/.rtf/.pages is answered with advice. Calling
 * `loadFile` directly sent a .docx from Finder or Explorer to pdf.js as though
 * it were a PDF, and it came back as "Failed to load PDF". Never rejects —
 * failures are reported here, like every other open.
 */
export function openHandedOver(file: File): Promise<void> {
  return enqueue(async () => {
    try {
      const { file: pdf, notice } = await toViewablePdf(file)
      if (liveHasDocument()) await openInBackgroundTab(pdf, notice)
      else await usePdfStore.getState().loadFile(pdf, { notice })
    } catch (err) {
      console.error(err)
      alert(err instanceof OfficeImportError ? err.message : getT()('lib.open_failed'))
    }
  })
}
