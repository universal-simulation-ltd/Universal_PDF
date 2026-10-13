import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// How the drawing tools behave, as the reader has tuned them (James,
// 2026-10-13):
//
//   • `stayOnTool` — Tune this app ▸ "Stay on the last tool". With the pen or
//     highlighter armed, pressing on something already on the page draws over
//     it instead of selecting it (and dropping you back to Select), and ✓
//     leaves the tool armed.
//   • `noConfirm` — Tune this app ▸ "Don't confirm annotations". A stroke,
//     line, shape, tick or cross is put down without being selected, so no
//     Colour pill, bin or ✓ comes up between one mark and the next.
//   • `penColours` / `highlightColours` — the two colour shortcuts beside the
//     pen and the highlighter in the toolbar. A custom colour picked from the
//     rainbow goes in first and the older of the two drops out: two at most.
//     The first one is the colour the tool is picked up with.
//
// Both switches start OFF, like every switch in the suite.
//
// ⚠️ A zustand store in its own localStorage key, not the SDK's
// `useUserPrefs` bag. Each `useUserPrefs()` call keeps its own copy of the
// bag and writes the whole copy back, so a toggle in the Tune this app dialog
// and a colour pinned from the toolbar (two separate copies) would overwrite
// each other. "Reset to defaults" reaches this through `reset()` (see
// lib/resetDefaults.ts).

export const DEFAULT_PEN_COLOURS = ['#000000', '#ffffff']
export const DEFAULT_HIGHLIGHT_COLOURS = ['#eab308', '#16a34a']
const MAX_PREFERRED = 2

export type ColourKind = 'pen' | 'highlight'

interface ToolPrefsState {
  stayOnTool: boolean
  noConfirm: boolean
  penColours: string[]
  highlightColours: string[]
  setStayOnTool: (v: boolean) => void
  setNoConfirm: (v: boolean) => void
  /** Pin a colour as a shortcut: first in line, the oldest drops out past two. */
  addPreferredColour: (kind: ColourKind, hex: string) => void
  reset: () => void
}

const DEFAULTS = {
  stayOnTool: false,
  noConfirm: false,
  penColours: DEFAULT_PEN_COLOURS,
  highlightColours: DEFAULT_HIGHLIGHT_COLOURS
}

export const useToolPrefs = create<ToolPrefsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setStayOnTool: (stayOnTool) => set({ stayOnTool }),
      setNoConfirm: (noConfirm) => set({ noConfirm }),
      addPreferredColour: (kind, hex) =>
        set((s) => {
          const key = kind === 'pen' ? 'penColours' : 'highlightColours'
          const h = hex.toLowerCase()
          // Already a shortcut: leave the pair where it is, so a swatch never
          // jumps sideways under the pointer.
          if (s[key].some((c) => c.toLowerCase() === h)) return {}
          return { [key]: [h, ...s[key]].slice(0, MAX_PREFERRED) }
        }),
      reset: () => set(DEFAULTS)
    }),
    {
      name: 'universal-pdf-tool-prefs',
      partialize: (s) => ({
        stayOnTool: s.stayOnTool,
        noConfirm: s.noConfirm,
        penColours: s.penColours,
        highlightColours: s.highlightColours
      })
    }
  )
)

/** The kind of colour the tool draws with: the highlighter keeps its own pair, and a sticky note shares it. */
export function colourKindFor(tool: string): ColourKind {
  return tool === 'highlight' || tool === 'note' ? 'highlight' : 'pen'
}
