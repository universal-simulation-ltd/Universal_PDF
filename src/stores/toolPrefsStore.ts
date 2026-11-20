import {
  DEFAULT_HIGHLIGHT_COLOURS,
  DEFAULT_PEN_COLOURS,
  MAX_PREFERRED,
  usePdfSettings,
  type PdfSettings,
} from './pdfSettings'

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
//   • `noteTopLeft` / `noteSetSize` — Tune this app ▸ how a new sticky note
//     starts. A note is centred and fitted to its card unless one is on
//     (James, 2026-10-13: "have both enabled by default and in tuning this
//     app have the default defined by user"). The note's own pill changes
//     only that note.
//   • `noDeleteConfirm` — Tune this app ▸ "Don't confirm page deletes", also
//     set by "Don't ask again" on the Pages list's delete question (James,
//     2026-11-03). Undo still brings a deleted page back.
//   • `penColours` / `highlightColours` — the two colour shortcuts beside the
//     pen and the highlighter in the toolbar. A custom colour picked from the
//     rainbow goes in first and the older of the two drops out: two at most.
//     The first one is the colour the tool is picked up with.
//
// Every switch starts OFF, like every switch in the suite.
//
// Since 2026-11-20 these live in the app's one synced settings store
// (pdfSettings.ts, @unisim/sdk createSyncedSettings): on the device, and
// signed in, on the account, newest change wins. This file keeps the
// zustand-style `useToolPrefs(selector)` / `useToolPrefs.getState()` the
// toolbar and the viewer already use, with the setters beside the values.
// "Reset to defaults" reaches it through the SDK's useResetAppDefaults (and
// `reset()` below, which the app's reset handlers still call).

export { DEFAULT_HIGHLIGHT_COLOURS, DEFAULT_PEN_COLOURS }

export type ColourKind = 'pen' | 'highlight'

type ToolValues = Pick<PdfSettings,
  'stayOnTool' | 'noConfirm' | 'noDeleteConfirm' | 'penColours' | 'highlightColours' | 'noteTopLeft' | 'noteSetSize'>

interface ToolPrefsActions {
  setNoteTopLeft: (v: boolean) => void
  setNoteSetSize: (v: boolean) => void
  setStayOnTool: (v: boolean) => void
  setNoConfirm: (v: boolean) => void
  setNoDeleteConfirm: (v: boolean) => void
  /** Pin a colour as a shortcut: first in line, the oldest drops out past two. */
  addPreferredColour: (kind: ColourKind, hex: string) => void
  reset: () => void
}

export type ToolPrefsState = ToolValues & ToolPrefsActions

const set = usePdfSettings.set

const actions: ToolPrefsActions = {
  setStayOnTool: (stayOnTool) => set({ stayOnTool }),
  setNoConfirm: (noConfirm) => set({ noConfirm }),
  setNoDeleteConfirm: (noDeleteConfirm) => set({ noDeleteConfirm }),
  setNoteTopLeft: (noteTopLeft) => set({ noteTopLeft }),
  setNoteSetSize: (noteSetSize) => set({ noteSetSize }),
  addPreferredColour: (kind, hex) =>
    set((s) => {
      const key = kind === 'pen' ? 'penColours' : 'highlightColours'
      const h = hex.toLowerCase()
      // Already a shortcut: leave the pair where it is, so a swatch never
      // jumps sideways under the pointer.
      if (s[key].some((c) => c.toLowerCase() === h)) return {}
      return { [key]: [h, ...s[key]].slice(0, MAX_PREFERRED) }
    }),
  // The tool switches and colours only; the phone's own switches have their
  // own reset (native/prefs.ts). Reset to defaults resets the lot anyway.
  reset: () => set({
    stayOnTool: false,
    noConfirm: false,
    noDeleteConfirm: false,
    noteTopLeft: false,
    noteSetSize: false,
    penColours: DEFAULT_PEN_COLOURS,
    highlightColours: DEFAULT_HIGHLIGHT_COLOURS,
  }),
}

function withActions(s: PdfSettings): ToolPrefsState {
  return { ...s, ...actions }
}

interface ToolPrefsStore {
  <U>(selector: (s: ToolPrefsState) => U): U
  getState(): ToolPrefsState
}

function useToolPrefsSlice<U>(selector: (s: ToolPrefsState) => U): U {
  return usePdfSettings((s) => selector(withActions(s)))
}

export const useToolPrefs: ToolPrefsStore = Object.assign(useToolPrefsSlice, {
  getState: () => withActions(usePdfSettings.getState()),
})

/** The kind of colour the tool draws with: the highlighter keeps its own pair, and a sticky note shares it. */
export function colourKindFor(tool: string): ColourKind {
  return tool === 'highlight' || tool === 'note' ? 'highlight' : 'pen'
}
