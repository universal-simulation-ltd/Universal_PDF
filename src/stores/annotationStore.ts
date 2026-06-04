import { create } from 'zustand'
import type { Annotation, FontFamily, Tool } from '../types/annotations'

interface AnnotationState {
  tool: Tool
  color: string
  strokeWidth: number
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
  past: Annotation[][]
  future: Annotation[][]
  setTool: (t: Tool) => void
  setColor: (c: string) => void
  setStrokeWidth: (w: number) => void
  setFontSize: (s: number) => void
  setFontFamily: (f: FontFamily) => void
  setSelected: (id: string | null) => void
  setSelectedIds: (ids: string[]) => void
  toggleSelected: (id: string) => void
  setUploadedImageSrc: (src: string | null) => void
  add: (a: Annotation) => void
  update: (id: string, patch: Partial<Annotation>) => void
  updateMany: (patches: { id: string; patch: Partial<Annotation> }[]) => void
  remove: (id: string) => void
  removeMany: (ids: string[]) => void
  clearPage: (pageIndex: number) => void
  clearAll: () => void
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
  fontSize: 18,
  fontFamily: 'sans',
  annotations: [],
  selectedId: null,
  selectedIds: [],
  uploadedImageSrc: null,
  past: [],
  future: [],
  setTool: (tool) => set({ tool }),
  setUploadedImageSrc: (uploadedImageSrc) => set({ uploadedImageSrc }),
  setColor: (color) =>
    set((s) => {
      const sel = s.annotations.find((a) => a.id === s.selectedId)
      if (sel && sel.type !== 'image') {
        return {
          color,
          annotations: s.annotations.map((a) =>
            a.id === sel.id ? ({ ...a, color } as Annotation) : a
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
            a.id === sel.id ? ({ ...a, strokeWidth } as Annotation) : a
          ),
          past: pushPast(s.past, s.annotations),
          future: []
        }
      }
      return { strokeWidth }
    }),
  setFontSize: (fontSize) =>
    set((s) => {
      const sel = s.annotations.find((a) => a.id === s.selectedId)
      if (sel && sel.type === 'text') {
        return {
          fontSize,
          annotations: s.annotations.map((a) =>
            a.id === sel.id ? ({ ...a, fontSize } as Annotation) : a
          ),
          past: pushPast(s.past, s.annotations),
          future: []
        }
      }
      return { fontSize }
    }),
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
  remove: (id) =>
    set((s) => ({
      annotations: s.annotations.filter((a) => a.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
      selectedIds: s.selectedIds.filter((x) => x !== id),
      past: pushPast(s.past, s.annotations),
      future: []
    })),
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
  remapPages: (indexMap) =>
    set((s) => ({
      annotations: s.annotations
        .filter((a) => indexMap.has(a.pageIndex))
        .map((a) => ({ ...a, pageIndex: indexMap.get(a.pageIndex)! } as Annotation)),
      selectedId: null,
      selectedIds: [],
      past: pushPast(s.past, s.annotations),
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
