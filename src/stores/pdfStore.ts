import { create } from 'zustand'
import { pdfjsLib, type PDFDocumentProxy } from '../lib/pdfjs'
import { listRecents, saveRecent, getRecent, getRecentBySlug, deleteRecent, renameRecent, type RecentMeta } from '../lib/recents'
import { applyPageOrderToPdf, buildPageIndexMap } from '../lib/pdfPages'
import { useAnnotationStore } from './annotationStore'
import { useFormStore } from './formStore'

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
  loading: boolean
  pageNavOpen: boolean
  previewOpen: boolean
  recents: RecentMeta[]
  loadFile: (file: File) => Promise<void>
  loadFromSlug: (slug: string) => Promise<boolean>
  loadFromCurrentUrl: () => Promise<boolean>
  reset: () => void
  togglePageNav: () => void
  setPageNavOpen: (open: boolean) => void
  setPreviewOpen: (open: boolean) => void
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
  loading: false,
  pageNavOpen: false,
  previewOpen: false,
  recents: [],
  togglePageNav: () => set((s) => ({ pageNavOpen: !s.pageNavOpen })),
  setPageNavOpen: (pageNavOpen) => set({ pageNavOpen }),
  setPreviewOpen: (previewOpen) => set({ previewOpen }),
  loadFile: async (file) => {
    set({ loading: true })
    try {
      get().doc?.destroy()
      const buf = await file.arrayBuffer()
      const renderCopy = buf.slice(0)
      const doc = await pdfjsLib.getDocument({ data: renderCopy }).promise
      set({
        doc,
        numPages: doc.numPages,
        fileName: file.name,
        sourceBytes: buf,
        loading: false
      })
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
    set({ doc: null, numPages: 0, fileName: null, sourceBytes: null, previewOpen: false })
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
    let doc: Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']> | null = null
    for (let attempt = 0; attempt < 2 && !doc; attempt++) {
      try {
        doc = await pdfjsLib.getDocument({ data: newBytes.slice(0) }).promise
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
    set({ doc, numPages: doc.numPages, sourceBytes: newBytes })

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
