import { create } from 'zustand'

// Where the phone screens are. Three tabs at the foot (Desk, Signatures, Tune)
// while no document is open; with one open, the document fills the screen and
// pages (Sign, Share, the Signed and Smaller moments) stack on top of it, with
// at most one bottom sheet (Mark up, What else, All free) over the lot.
//
// ⚠️ Every layer is also a history entry, so Android's back gesture and the
// browser's Back close the top one: see `useHistoryLayers` in NativeApp.tsx.
// Code here only changes the state; it never touches `history` itself.

export type Tab = 'desk' | 'signatures' | 'tune'
export type Screen = 'sign' | 'share' | 'signed' | 'smaller' | 'qr'
export type Sheet = 'markup' | 'more' | 'free'

/** What the Smaller moment shows: the sizes before and after, and the file. */
export interface SmallerResult {
  before: number
  after: number
  bytes: Uint8Array
}

interface NavState {
  tab: Tab
  screens: Screen[]
  sheet: Sheet | null
  smaller: SmallerResult | null
  /** The Share page opens on "Smaller" when it is reached from the Smaller moment. */
  shareSmaller: boolean
  /** The Share page opens with "Needs a password" on (the Lock job). */
  sharePassword: boolean
  /** A short message at the foot of the screen, in place of an alert. */
  toast: string | null
  /** A signature from the Sign page is on its way to the page: its landing is the Signed moment. */
  awaitingSignature: boolean
  setTab: (tab: Tab) => void
  push: (screen: Screen) => void
  /** Back one page (the history entry follows on its own). */
  pop: () => void
  /** Swap the top page for another, without a back step between them. */
  replaceTop: (screen: Screen) => void
  /** Drop every page above the document. */
  clearScreens: () => void
  openSheet: (sheet: Sheet) => void
  closeSheet: () => void
  setSmaller: (r: SmallerResult | null) => void
  setShareSmaller: (v: boolean) => void
  setSharePassword: (v: boolean) => void
  say: (message: string) => void
  dismissToast: () => void
  setAwaitingSignature: (v: boolean) => void
}

export const useNav = create<NavState>((set) => ({
  tab: 'desk',
  screens: [],
  sheet: null,
  smaller: null,
  shareSmaller: false,
  sharePassword: false,
  toast: null,
  awaitingSignature: false,
  setTab: (tab) => set({ tab }),
  push: (screen) => set((s) => ({ screens: [...s.screens, screen], sheet: null, toast: null })),
  pop: () => set((s) => ({ screens: s.screens.slice(0, -1) })),
  replaceTop: (screen) => set((s) => ({ screens: [...s.screens.slice(0, -1), screen], sheet: null, toast: null })),
  clearScreens: () => set({ screens: [], sheet: null }),
  openSheet: (sheet) => set({ sheet }),
  closeSheet: () => set({ sheet: null }),
  setSmaller: (smaller) => set({ smaller }),
  setShareSmaller: (shareSmaller) => set({ shareSmaller }),
  setSharePassword: (sharePassword) => set({ sharePassword }),
  say: (toast) => set({ toast }),
  dismissToast: () => set({ toast: null }),
  setAwaitingSignature: (awaitingSignature) => set({ awaitingSignature }),
}))

/** The page on top, or null for the document itself. */
export function topScreen(screens: Screen[]): Screen | null {
  return screens.length ? screens[screens.length - 1] : null
}
