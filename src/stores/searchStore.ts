import { create } from 'zustand'
import type { SearchMatch } from '../lib/pdfText'

// Find state lives in its own store so the floating find bar and the per-page
// highlight overlays can subscribe independently. Text extraction and matching
// happen in the FindBar (it owns the pdf doc); the results land here.
interface SearchState {
  open: boolean
  query: string
  matches: SearchMatch[]
  // Index into `matches` of the currently-focused result, or -1 when there are
  // none. Drives "3 / 12" and which highlight is emphasised / scrolled to.
  activeIndex: number
  setOpen: (open: boolean) => void
  setQuery: (query: string) => void
  setMatches: (matches: SearchMatch[]) => void
  setActiveIndex: (i: number) => void
  next: () => void
  prev: () => void
  reset: () => void
}

export const useSearchStore = create<SearchState>((set) => ({
  open: false,
  query: '',
  matches: [],
  activeIndex: -1,
  setOpen: (open) => set(open ? { open } : { open: false, matches: [], activeIndex: -1 }),
  setQuery: (query) => set({ query }),
  setMatches: (matches) => set({ matches, activeIndex: matches.length ? 0 : -1 }),
  setActiveIndex: (activeIndex) => set({ activeIndex }),
  next: () =>
    set((s) => (s.matches.length ? { activeIndex: (s.activeIndex + 1) % s.matches.length } : {})),
  prev: () =>
    set((s) =>
      s.matches.length
        ? { activeIndex: (s.activeIndex - 1 + s.matches.length) % s.matches.length }
        : {}
    ),
  reset: () => set({ open: false, query: '', matches: [], activeIndex: -1 })
}))
