import { create } from 'zustand'

// Where the phone screens are. Three tabs at the foot (Desk, Signatures, Tune)
// while no document is open; with one open, the document fills the screen and
// pages (Sign, Share, the Signed and Smaller moments) stack on top of it, with
// at most one bottom sheet (Mark up, What else, All free) over the lot.
// The knowledge base ('kb', and 'kb-article' over it) and the job pages (Scan,
// Merge, Photos, OCR, Compare) can also sit over the tabs, since Tune and the
// Desk open them with no document open.
//
// ⚠️ Every layer is also a history entry, so Android's back gesture and the
// browser's Back close the top one: the SDK's phone layer stack (usePhoneLayer, set up in NativeApp.tsx).
// Code here only changes the state; it never touches `history` itself.

export type Tab = 'desk' | 'signatures' | 'tune'
export type Screen =
  | 'sign' | 'share' | 'signed' | 'smaller' | 'blacked' | 'sent' | 'qr' | 'pages'
  // One page large, over the Pages page (PagesScreen keeps both).
  | 'page-view'
  | 'kb' | 'kb-article'
  // The jobs that make a new PDF (or read two), pages of their own: they open
  // from the Desk with no document as well as from What else.
  | 'scan' | 'merge' | 'photos' | 'ocr' | 'compare'
export type Sheet = 'markup' | 'more' | 'free' | 'send-sign'

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
  /** The article the 'kb-article' page shows. */
  kbArticle: string | null
  /**
   * A page that wants a word before it goes (Scan, with pages on it): asked by
   * every way back — the back link, a swipe from the edge, Android's back.
   * Returns false to stay.
   */
  backGuard: (() => boolean) | null
  /** The page the Pages page opens scrolled to and marked (the document's page chip). */
  pagesFocus: number | null
  setPagesFocus: (i: number | null) => void
  /** The Desk's search is in use and the cobalt desk folded away (the status bar's glyphs go dark). */
  deskSearching: boolean
  setBackGuard: (fn: (() => boolean) | null) => void
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
  /** Open an article over the knowledge base's list, or turn to another in place. */
  readArticle: (id: string) => void
  /** Take the pages that can stand over the tabs off the stack (a document arrived under them). */
  dropKnowledge: () => void
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
  kbArticle: null,
  backGuard: null,
  deskSearching: false,
  pagesFocus: null,
  setPagesFocus: (pagesFocus) => set({ pagesFocus }),
  setBackGuard: (backGuard) => set({ backGuard }),
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
  readArticle: (id) =>
    set((s) => (topScreen(s.screens) === 'kb-article' ? { kbArticle: id } : { screens: [...s.screens, 'kb-article'], kbArticle: id, sheet: null, toast: null })),
  dropKnowledge: () => set((s) => ({ screens: s.screens.filter((x) => !overTabs(x)) })),
}))

/** Back one page, unless the page on top wants to stay (see `backGuard`). True if it went. */
export function goBack(): boolean {
  const { backGuard, pop } = useNav.getState()
  if (backGuard && !backGuard()) return false
  pop()
  return true
}

/** The page on top, or null for the document itself. */
export function topScreen(screens: Screen[]): Screen | null {
  return screens.length ? screens[screens.length - 1] : null
}

/** The knowledge base's pages. */
export function isKnowledge(screen: Screen | null): boolean {
  return screen === 'kb' || screen === 'kb-article'
}

/** The job pages that make a new PDF from files picked on them. */
export function isJobPage(screen: Screen | null): boolean {
  return screen === 'scan' || screen === 'merge' || screen === 'photos' || screen === 'ocr' || screen === 'compare'
}

/** The pages that may also stand over the tabs, with no document open. */
export function overTabs(screen: Screen | null): boolean {
  return isKnowledge(screen) || isJobPage(screen)
}
