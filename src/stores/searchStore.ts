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
  // Set when the find bar is opened specifically to redact matches (via the
  // Redact → "Find and redact" menu) so the bar opens with the redact panel
  // already expanded.
  redactIntent: boolean
  openForRedact: () => void
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
  redactIntent: false,
  openForRedact: () => set({ open: true, redactIntent: true }),
  setOpen: (open) =>
    set(open ? { open, redactIntent: false } : { open: false, matches: [], activeIndex: -1, redactIntent: false }),
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
  reset: () => set({ open: false, query: '', matches: [], activeIndex: -1, redactIntent: false })
}))
