import { create } from 'zustand'
import { loadPdf, type PDFDocumentProxy } from '../lib/pdfjs'
import { listRecents, saveRecent, getRecent, getRecentBySlug, getRecentEdits, updateRecentEdits, deleteRecent, renameRecent, type RecentMeta, type RecentEdits } from '../lib/recents'
import { readEmbeddedSigFields } from '../lib/export'
import { applyPageOrderToPdf, buildPageIndexMap } from '../lib/pdfPages'
import { useAnnotationStore } from './annotationStore'
import { useFormStore } from './formStore'
import { useSearchStore } from './searchStore'
import { useSignatureStore } from './signatureStore'

// Restore a recent's saved edits into the live stores. Applies whenever the
// stored arrays EXIST (even when empty) so a deliberately-cleared document
// stays cleared on reopen — `undefined` means "never persisted", in which case
// we leave whatever loadFile hydrated from the PDF (e.g. embedded sig fields).
// Returns true if annotations were applied.
function applyRecentEdits(edits: RecentEdits): boolean {
  let applied = false
  if (edits.annotations) {
    useAnnotationStore.setState({
      annotations: edits.annotations,
      selectedId: null,
      selectedIds: [],
      past: [],
      future: []
    })
    applied = true
  }
  if (edits.formValues) {
    useFormStore.setState({ values: edits.formValues })
  }
  return applied
}

// Wipe every piece of per-document editing state so nothing from the PDF being
// closed (annotations, drawings, signatures, highlights, form values, find
// results, in-progress signature placement) leaks onto the next one. Called
// when a different PDF is opened and when the document is closed/reset. The
// saved signature *library* is intentionally left alone — it is a reusable,
// cross-document collection.
function clearDocumentState() {
  useAnnotationStore.getState().resetDocument()
  useFormStore.getState().clearAll()
  useSearchStore.getState().reset()
  useSignatureStore.getState().setPendingExtras([])
}

function setHashSlug(slug: string | null) {
  if (typeof window === 'undefined') return
  const target = slug ? `#${slug}` : ''
  if (window.location.hash === target) return
  // Use replaceState so the user's browser history doesn't fill up with
  // every PDF they open in this session.
  const url = window.location.pathname + window.location.search + target
  window.history.replaceState(null, '', url)
}

function readHashSlug(): string | null {
  if (typeof window === 'undefined') return null
  const h = window.location.hash.replace(/^#/, '').trim()
  return /^[a-z0-9]{4,16}$/i.test(h) ? h : null
}

interface PdfState {
  doc: PDFDocumentProxy | null
  numPages: number
  fileName: string | null
  sourceBytes: ArrayBuffer | null
  // True for Adobe LiveCycle/Designer XFA forms — the viewer renders these via
  // the XFA HTML layer (XfaPage) and saves filled values with saveDocument().
  isXfa: boolean
  loading: boolean
  pageNavOpen: boolean
  previewOpen: boolean
  presentOpen: boolean
  hostedStoreOpen: boolean
  recents: RecentMeta[]
  loadFile: (file: File) => Promise<void>
  loadFromSlug: (slug: string) => Promise<boolean>
  loadFromCurrentUrl: () => Promise<boolean>
  reset: () => void
  togglePageNav: () => void
  setPageNavOpen: (open: boolean) => void
  setPreviewOpen: (open: boolean) => void
  setPresentOpen: (open: boolean) => void
  setHostedStoreOpen: (open: boolean) => void
  refreshRecents: () => Promise<void>
  openRecent: (id: string) => Promise<void>
  removeRecent: (id: string) => Promise<void>
  renameFile: (newName: string) => Promise<void>
  applyPageOrder: (newOrder: number[]) => Promise<void>
  deletePage: (pageIndex: number) => Promise<void>
  movePage: (from: number, to: number) => Promise<void>
}

export const usePdfStore = create<PdfState>((set, get) => ({
  doc: null,
  numPages: 0,
  fileName: null,
  sourceBytes: null,
  isXfa: false,
  loading: false,
  pageNavOpen: false,
  previewOpen: false,
  presentOpen: false,
  hostedStoreOpen: false,
  recents: [],
  togglePageNav: () => set((s) => ({ pageNavOpen: !s.pageNavOpen })),
  setPageNavOpen: (pageNavOpen) => set({ pageNavOpen }),
  setPreviewOpen: (previewOpen) => set({ previewOpen }),
  setPresentOpen: (presentOpen) => set({ presentOpen }),
  setHostedStoreOpen: (hostedStoreOpen) => set({ hostedStoreOpen }),
  loadFile: async (file) => {
    set({ loading: true })
    try {
      get().doc?.destroy()
      const buf = await file.arrayBuffer()
      const renderCopy = buf.slice(0)
      const doc = await loadPdf(renderCopy).promise
      // A different document is now in hand — drop the outgoing PDF's
      // annotations/drawings/signatures/form/find state before showing it.
      clearDocumentState()
      set({
        doc,
        numPages: doc.numPages,
        fileName: file.name,
        sourceBytes: buf,
        isXfa: doc.isPureXfa,
        loading: false
      })
      // Re-hydrate any signature-request boxes embedded in the PDF (from a prior
      // export) so a reopened / shared file's boxes are interactive again. The
      // doc is already on screen; this just drops the boxes in a beat later.
      // Callers that restore saved edits (openRecent / loadFromSlug / backup)
      // replace these afterwards, so there's no duplication.
      try {
        const fields = await readEmbeddedSigFields(buf.slice(0))
        if (fields.length > 0) {
          useAnnotationStore.setState((s) => ({ annotations: [...s.annotations, ...fields] }))
        }
      } catch {
        // Best-effort — a parse failure just means no boxes are recovered.
      }
      // Persist to recents in the background — never blocks loading.
      // The returned slug becomes the URL hash so a refresh reloads the
      // same PDF straight from IndexedDB.
      saveRecent(file.name, buf)
        .then((slug) => {
          if (slug) setHashSlug(slug)
          return get().refreshRecents()
        })
        .catch(() => {})
    } catch (e) {
      set({ loading: false })
      throw e
    }
  },
  loadFromSlug: async (slug) => {
    const hit = await getRecentBySlug(slug)
    if (!hit) return false
    const file = new File([hit.bytes], hit.meta.name, { type: 'application/pdf' })
    await get().loadFile(file)
    // Restore the edits saved for this document (supersedes anything loadFile
    // hydrated from the PDF), so a refresh brings back the user's work.
    applyRecentEdits(hit.edits)
    return true
  },
  loadFromCurrentUrl: async () => {
    const slug = readHashSlug()
    if (!slug) return false
    const ok = await get().loadFromSlug(slug)
    if (!ok) {
      // Stale slug — clear the hash so we fall back to the landing page.
      setHashSlug(null)
    }
    return ok
  },
  reset: () => {
    get().doc?.destroy()
    clearDocumentState()
    set({ doc: null, numPages: 0, fileName: null, sourceBytes: null, isXfa: false, previewOpen: false, presentOpen: false })
    setHashSlug(null)
  },
  refreshRecents: async () => {
    const recents = await listRecents()
    set({ recents })
  },
  openRecent: async (id) => {
    const bytes = await getRecent(id)
    if (!bytes) return
    const meta = get().recents.find((r) => r.id === id)
    if (!meta) return
    const file = new File([bytes], meta.name, { type: 'application/pdf' })
    await get().loadFile(file)
    // Restore the edits saved for this document (see loadFromSlug).
    applyRecentEdits(await getRecentEdits(id))
  },
  removeRecent: async (id) => {
    // Optimistic update, then drop from IndexedDB.
    set((s) => ({ recents: s.recents.filter((r) => r.id !== id) }))
    await deleteRecent(id)
  },
  renameFile: async (newName) => {
    const next = newName.trim()
    if (!next) return
    const cleaned = /\.pdf$/i.test(next) ? next : `${next}.pdf`
    const current = get().fileName
    if (!current || current === cleaned) return
    set({ fileName: cleaned })
    await renameRecent(current, cleaned)
    await get().refreshRecents()
  },
  applyPageOrder: async (newOrder) => {
    const bytes = get().sourceBytes
    const fileName = get().fileName
    if (!bytes || !fileName) return
    if (newOrder.length === 0) return

    const current = get().numPages
    const isNoop =
      newOrder.length === current && newOrder.every((idx, i) => idx === i)
    if (isNoop) return

    const newBytes = await applyPageOrderToPdf(bytes, newOrder)
    const indexMap = buildPageIndexMap(newOrder)

    // Build the new doc FIRST, before touching any state. Previously the
    // annotation/form remap and the old doc's destroy() ran ahead of this
    // getDocument call, so a transient first-attempt failure left annotations
    // remapped and the old doc destroyed — a half-applied state that a second
    // "delete" appeared to fix. Doing all the destructive work only after the
    // new doc is in hand makes the operation atomic: it either fully succeeds
    // or leaves everything untouched. One retry covers a flaky worker init.
    let doc: Awaited<ReturnType<typeof loadPdf>['promise']> | null = null
    for (let attempt = 0; attempt < 2 && !doc; attempt++) {
      try {
        doc = await loadPdf(newBytes.slice(0)).promise
      } catch (err) {
        if (attempt === 1) throw err
      }
    }
    if (!doc) return

    // Now commit, in order: remap annotations/forms (before React renders the
    // new doc so they land on the right pages), swap out the old doc, set state.
    useAnnotationStore.getState().remapPages(indexMap)
    useFormStore.getState().remapPages(indexMap)
    get().doc?.destroy()
    set({ doc, numPages: doc.numPages, sourceBytes: newBytes, isXfa: doc.isPureXfa })

    saveRecent(fileName, newBytes)
      .then((slug) => {
        if (slug) setHashSlug(slug)
        return get().refreshRecents()
      })
      .catch(() => {})
  },
  deletePage: async (pageIndex) => {
    const total = get().numPages
    if (total <= 1) return
    if (pageIndex < 0 || pageIndex >= total) return
    const newOrder = Array.from({ length: total }, (_, i) => i).filter(
      (i) => i !== pageIndex
    )
    await get().applyPageOrder(newOrder)
  },
  movePage: async (from, to) => {
    const total = get().numPages
    if (from === to) return
    if (from < 0 || from >= total) return
    if (to < 0 || to >= total) return
    const order = Array.from({ length: total }, (_, i) => i)
    const [moved] = order.splice(from, 1)
    order.splice(to, 0, moved)
    await get().applyPageOrder(order)
  }
}))

// ── Edit auto-save ─────────────────────────────────────────────────────────
// Persist the open document's annotations + form values to its recents entry,
// debounced, whenever they change — so closing and reopening the file (from the
// recents list or a refresh) restores the work, signature-request boxes and
// all. Selection / tool changes don't touch the annotation array reference, so
// they're skipped here.
if (typeof window !== 'undefined') {
  let timer: number | null = null
  let lastAnns: unknown = null
  let lastForms: unknown = null

  const schedule = () => {
    const anns = useAnnotationStore.getState().annotations
    const forms = useFormStore.getState().values
    if (anns === lastAnns && forms === lastForms) return
    lastAnns = anns
    lastForms = forms
    const { doc, fileName } = usePdfStore.getState()
    if (!doc || !fileName) return
    if (timer !== null) clearTimeout(timer)
    timer = window.setTimeout(() => {
      timer = null
      const name = usePdfStore.getState().fileName
      if (!name) return
      void updateRecentEdits(name, {
        annotations: useAnnotationStore.getState().annotations,
        formValues: useFormStore.getState().values
      })
    }, 600)
  }

  useAnnotationStore.subscribe(schedule)
  useFormStore.subscribe(schedule)
}
