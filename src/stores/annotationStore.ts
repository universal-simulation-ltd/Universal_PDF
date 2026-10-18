import { create } from 'zustand'
import type { Annotation, FontFamily, Tool } from '../types/annotations'
import type { QrPlacement } from '../lib/qr/design'

interface AnnotationState {
  tool: Tool
  // The one colour every annotation is drawn with, redactions included — a
  // redaction stores it as `fill` rather than `color`, but the toolbar swatches
  // are the single control (there is no separate redaction palette any more).
  color: string
  strokeWidth: number
  // The highlighter's width, in display pixels like strokeWidth: its own, set
  // from the slider beside its colours in the toolbar.
  highlightWidth: number
  // Black out drawn as a freehand stroke, like the highlighter, rather than a
  // box swept out (the phone's Mark up sheet: James, 2026-10-18 — "can redact
  // act like a highlighter, we already have the shape fill"). The website's
  // Redact tool keeps the box. The width is in display pixels, as above.
  redactStroke: boolean
  redactWidth: number
  // The viewer's current page scale (zoom × 96/72), published by PdfViewer so
  // a width set from outside the page — the phone's Mark up sheet — can be
  // turned into the page units a selected stroke stores.
  viewScale: number
  // A tool sheet (the phone's Mark up sheet) is open and carries the colour
  // and width of what is selected, so the page's own Colour pill for a drawn
  // mark stands down rather than repeat it.
  toolSheetOpen: boolean
  // The last mark kept with its ✓ ("I'm done with this one"), and a count so
  // the same mark kept twice is still news. The phone's Signed moment waits
  // for this on a signature it saw placed.
  confirmed: { id: string; seq: number } | null
  confirm: (id: string) => void
  // When true the line tool draws "rigid" strokes that snap to the nearest
  // horizontal, vertical or 45° diagonal. Free-form lines when false.
  lineSnap: boolean
  fontSize: number
  fontFamily: FontFamily
  annotations: Annotation[]
  // Primary single selection. Kept in sync with `selectedIds`: it is the id
  // when exactly one thing is selected, and null for an empty or multi
  // selection. Existing single-select callers can keep reading this.
  selectedId: string | null
  // Full selection set. Drives the group move/resize/rotate Transformer.
  selectedIds: string[]
  uploadedImageSrc: string | null
  // Set alongside `uploadedImageSrc` when the armed image is a generated QR
  // code: the editor state it came from, which rides onto the annotation at
  // placement so the code can be edited again on the page. Null for an
  // ordinary uploaded picture.
  uploadedImageQr: QrPlacement | null
  past: Annotation[][]
  future: Annotation[][]
  setTool: (t: Tool) => void
  setColor: (c: string) => void
  setStrokeWidth: (w: number) => void
  setHighlightWidth: (w: number) => void
  setLineSnap: (v: boolean) => void
  setRedactStroke: (v: boolean) => void
  setRedactWidth: (w: number) => void
  setViewScale: (k: number) => void
  setToolSheetOpen: (v: boolean) => void
  setFontSize: (s: number) => void
  // Remember the size (in display pixels) the next text should be placed at,
  // WITHOUT touching the selected annotation. The floating size pill sets a
  // selected box's size absolutely — it knows the zoom, so it can convert
  // display pixels to points itself — and then records the choice here so the
  // next text matches. `setFontSize` is the relative nudge the toolbar uses.
  setDefaultFontSize: (s: number) => void
  setFontFamily: (f: FontFamily) => void
  setSelected: (id: string | null) => void
  setSelectedIds: (ids: string[]) => void
  toggleSelected: (id: string) => void
  setUploadedImageSrc: (src: string | null, qr?: QrPlacement | null) => void
  add: (a: Annotation) => void
  addMany: (items: Annotation[]) => void
  update: (id: string, patch: Partial<Annotation>) => void
  updateMany: (patches: { id: string; patch: Partial<Annotation> }[]) => void
  remove: (id: string) => void
  // Remove one annotation and add another (on top, as `add` would), as ONE
  // history step, and select the new one — e.g. a shape turned into a
  // redaction (see lib/redactShape). A separate remove + add was two steps, so
  // one undo left the page with neither.
  replace: (id: string, next: Annotation) => void
  removeMany: (ids: string[]) => void
  // Take some marks off and put others on as ONE history step, nothing
  // selected — page numbers re-applied in another style (lib/pageNumbers).
  swapMany: (removeIds: string[], add: Annotation[]) => void
  // Patches that are NOT a step of their own: the page numbers being put
  // right after a page change (usePageNumberSync). Undo lands on the marks as
  // they were, and the sync puts them right again.
  quietUpdateMany: (patches: { id: string; patch: Partial<Annotation> }[]) => void
  clearPage: (pageIndex: number) => void
  clearAll: () => void
  // Hard reset for loading a different PDF: drops every annotation AND the
  // undo/redo history, so nothing from the previous document can be undone
  // back onto the new one. (clearAll deliberately keeps history so the user can
  // undo the clear; that would be wrong across documents.)
  resetDocument: () => void
  remapPages: (indexMap: Map<number, number>) => void
  undo: () => void
  redo: () => void
}

const MAX_HISTORY = 100

function pushPast(past: Annotation[][], current: Annotation[]): Annotation[][] {
  const next = [...past, current]
  return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next
}

export const useAnnotationStore = create<AnnotationState>((set) => ({
  tool: 'select',
  color: '#000000',
  strokeWidth: 2.5,
  highlightWidth: 16,
  redactStroke: false,
  redactWidth: 22,
  viewScale: 1,
  toolSheetOpen: false,
  confirmed: null,
  lineSnap: false,
  fontSize: 18,
  fontFamily: 'sans',
  annotations: [],
  selectedId: null,
  selectedIds: [],
  uploadedImageSrc: null,
  uploadedImageQr: null,
  past: [],
  future: [],
  setTool: (tool) => set({ tool }),
  // The QR payload defaults to null rather than being left alone, so arming a
  // plain picture after a code can't drop the code's design onto it.
  setUploadedImageSrc: (uploadedImageSrc, uploadedImageQr = null) =>
    set({ uploadedImageSrc, uploadedImageQr }),
  setColor: (color) =>
    set((s) => {
      const sel = s.annotations.find((a) => a.id === s.selectedId)
      if (sel && sel.type !== 'image') {
        // A redaction carries its colour as `fill` — the solid block it is
        // baked as — where every other annotation carries `color`. Same
        // swatches, same setter; only the field differs.
        // A sticky note's colour is its paper; its ink stays dark.
        const patch = sel.type === 'redact' ? { fill: color } : sel.type === 'text' && sel.note ? { note: color } : { color }
        return {
          color,
          annotations: s.annotations.map((a) =>
            a.id === sel.id ? ({ ...a, ...patch } as Annotation) : a
          ),
          past: pushPast(s.past, s.annotations),
          future: []
        }
      }
      return { color }
    }),
  setStrokeWidth: (strokeWidth) =>
    set((s) => {
      const sel = s.annotations.find((a) => a.id === s.selectedId)
      if (sel && sel.type === 'draw') {
        return {
          strokeWidth,
          annotations: s.annotations.map((a) =>
            // ⚠️ In page units, as the stroke was placed (`strokeWidth / scale`
            // in AnnotationLayer). The display-pixel value went in as it was,
            // so a selected line jumped by the zoom the moment its width moved.
            a.id === sel.id ? ({ ...a, strokeWidth: strokeWidth / s.viewScale } as Annotation) : a
          ),
          past: pushPast(s.past, s.annotations),
          future: []
        }
      }
      return { strokeWidth }
    }),
  // Repaints a selected highlighter stroke as well, as the colour does — the
  // size is in display pixels, the stroke stores page units.
  setHighlightWidth: (highlightWidth) =>
    set((s) => {
      const sel = s.annotations.find((a) => a.id === s.selectedId)
      if (sel && sel.type === 'draw' && sel.opacity !== undefined) {
        return {
          highlightWidth,
          annotations: s.annotations.map((a) =>
            a.id === sel.id ? ({ ...a, strokeWidth: highlightWidth / s.viewScale } as Annotation) : a
          ),
          past: pushPast(s.past, s.annotations),
          future: []
        }
      }
      return { highlightWidth }
    }),
  setRedactStroke: (redactStroke) => set({ redactStroke }),
  setRedactWidth: (redactWidth) => set({ redactWidth }),
  setViewScale: (viewScale) => set({ viewScale }),
  setToolSheetOpen: (toolSheetOpen) => set({ toolSheetOpen }),
  confirm: (id) => set((s) => ({ confirmed: { id, seq: (s.confirmed?.seq ?? 0) + 1 } })),
  setLineSnap: (lineSnap) => set({ lineSnap }),
  setFontSize: (fontSize) =>
    set((s) => {
      const sel = s.annotations.find((a) => a.id === s.selectedId)
      if (sel && sel.type === 'text') {
        // The pill shows a size in display pixels, but a text annotation stores
        // its size in PDF points (created as display ÷ scale — see
        // AnnotationLayer). Writing the raw pill value straight into the
        // annotation mixed the two spaces, so a single +/- step snapped the
        // on-screen text by the zoom factor. Instead nudge the annotation's
        // point size by the same ratio the pill moved, keeping display and
        // model in lock-step whatever the current zoom.
        const prev = s.fontSize || fontSize
        const nextFontSize = Math.max(1, sel.fontSize * (prev > 0 ? fontSize / prev : 1))
        return {
          fontSize,
          annotations: s.annotations.map((a) =>
            a.id === sel.id ? ({ ...a, fontSize: nextFontSize } as Annotation) : a
          ),
          past: pushPast(s.past, s.annotations),
          future: []
        }
      }
      return { fontSize }
    }),
  setDefaultFontSize: (fontSize) => set({ fontSize }),
  setFontFamily: (fontFamily) =>
    set((s) => {
      const sel = s.annotations.find((a) => a.id === s.selectedId)
      if (sel && sel.type === 'text') {
        return {
          fontFamily,
          annotations: s.annotations.map((a) =>
            a.id === sel.id ? ({ ...a, fontFamily } as Annotation) : a
          ),
          past: pushPast(s.past, s.annotations),
          future: []
        }
      }
      return { fontFamily }
    }),
  setSelected: (selectedId) =>
    set({ selectedId, selectedIds: selectedId ? [selectedId] : [] }),
  setSelectedIds: (ids) =>
    set({ selectedIds: ids, selectedId: ids.length === 1 ? ids[0] : null }),
  toggleSelected: (id) =>
    set((s) => {
      const next = s.selectedIds.includes(id)
        ? s.selectedIds.filter((x) => x !== id)
        : [...s.selectedIds, id]
      return { selectedIds: next, selectedId: next.length === 1 ? next[0] : null }
    }),
  add: (a) =>
    set((s) => ({
      annotations: [...s.annotations, a],
      selectedId: a.id,
      selectedIds: [a.id],
      past: pushPast(s.past, s.annotations),
      future: []
    })),
  // Add several annotations as one history step (e.g. "Redact all matches"),
  // so the whole batch is a single undo and ends up selected together.
  addMany: (items) =>
    set((s) => {
      if (items.length === 0) return {}
      return {
        annotations: [...s.annotations, ...items],
        selectedId: items.length === 1 ? items[0].id : null,
        selectedIds: items.map((i) => i.id),
        past: pushPast(s.past, s.annotations),
        future: []
      }
    }),
  update: (id, patch) =>
    set((s) => ({
      annotations: s.annotations.map((a) =>
        a.id === id ? ({ ...a, ...patch } as Annotation) : a
      ),
      past: pushPast(s.past, s.annotations),
      future: []
    })),
  // Apply several patches as a single history step so a group move / resize /
  // rotate is one undo, not one-per-annotation.
  updateMany: (patches) =>
    set((s) => {
      if (patches.length === 0) return {}
      const byId = new Map(patches.map((p) => [p.id, p.patch]))
      return {
        annotations: s.annotations.map((a) =>
          byId.has(a.id) ? ({ ...a, ...byId.get(a.id) } as Annotation) : a
        ),
        past: pushPast(s.past, s.annotations),
        future: []
      }
    }),
  swapMany: (removeIds, add) =>
    set((s) => {
      const gone = new Set(removeIds)
      return {
        annotations: [...s.annotations.filter((a) => !gone.has(a.id)), ...add],
        selectedId: null,
        selectedIds: [],
        past: pushPast(s.past, s.annotations),
        future: []
      }
    }),
  quietUpdateMany: (patches) =>
    set((s) => {
      if (patches.length === 0) return {}
      const byId = new Map(patches.map((p) => [p.id, p.patch]))
      return {
        annotations: s.annotations.map((a) =>
          byId.has(a.id) ? ({ ...a, ...byId.get(a.id) } as Annotation) : a
        )
      }
    }),
  remove: (id) =>
    set((s) => ({
      annotations: s.annotations.filter((a) => a.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
      selectedIds: s.selectedIds.filter((x) => x !== id),
      past: pushPast(s.past, s.annotations),
      future: []
    })),
  replace: (id, next) =>
    set((s) => {
      if (!s.annotations.some((a) => a.id === id)) return {}
      return {
        annotations: [...s.annotations.filter((a) => a.id !== id), next],
        selectedId: next.id,
        selectedIds: [next.id],
        past: pushPast(s.past, s.annotations),
        future: []
      }
    }),
  removeMany: (ids) =>
    set((s) => {
      if (ids.length === 0) return {}
      const drop = new Set(ids)
      return {
        annotations: s.annotations.filter((a) => !drop.has(a.id)),
        selectedId: null,
        selectedIds: [],
        past: pushPast(s.past, s.annotations),
        future: []
      }
    }),
  clearPage: (pageIndex) =>
    set((s) => ({
      annotations: s.annotations.filter((a) => a.pageIndex !== pageIndex),
      past: pushPast(s.past, s.annotations),
      future: []
    })),
  clearAll: () =>
    set((s) => ({
      annotations: [],
      selectedId: null,
      selectedIds: [],
      past: pushPast(s.past, s.annotations),
      future: []
    })),
  resetDocument: () =>
    set({
      annotations: [],
      selectedId: null,
      selectedIds: [],
      uploadedImageSrc: null,
      uploadedImageQr: null,
      past: [],
      future: []
    }),
  remapPages: (indexMap) =>
    set((s) => ({
      annotations: s.annotations
        .filter((a) => indexMap.has(a.pageIndex))
        .map((a) => ({ ...a, pageIndex: indexMap.get(a.pageIndex)! } as Annotation)),
      selectedId: null,
      selectedIds: [],
      // ⚠️ CLEARED, not pushed. A page change is undone by the document undo
      // (pdfStore.snapshotDocument), which brings back the bytes AND the marks
      // together. Pushing the pre-remap marks here put a step in FRONT of it —
      // `useUndo` drains this history first — so Ctrl+Z after deleting page 1
      // restored page 1's marks onto what was now page 2, and left the page
      // itself deleted. Older steps go too: they index the old page order.
      past: [],
      future: []
    })),
  undo: () =>
    set((s) => {
      if (s.past.length === 0) return {}
      const prev = s.past[s.past.length - 1]
      return {
        annotations: prev,
        past: s.past.slice(0, -1),
        future: [...s.future, s.annotations],
        selectedId: null,
        selectedIds: []
      }
    }),
  redo: () =>
    set((s) => {
      if (s.future.length === 0) return {}
      const next = s.future[s.future.length - 1]
      return {
        annotations: next,
        past: [...s.past, s.annotations],
        future: s.future.slice(0, -1),
        selectedId: null,
        selectedIds: []
      }
    })
}))
