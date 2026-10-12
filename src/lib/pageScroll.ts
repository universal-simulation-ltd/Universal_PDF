import { readDefaultView, useDefaultView } from '@unisim/sdk'
import { isNativeShell } from './nativeOpen'

// Which way the open document's pages run: one under another or side by side in
// a row. Set in Tune this app ▸ Page scrolling. The default depends on the
// device (James, 2026-10-12: "the default scroll to be horizontal on mobile"):
// side by side on a phone and in the phone app, a page a swipe like a book;
// one under another on a computer.
//
// ⚠️ STORED THROUGH THE SDK'S DEFAULT-VIEW ROW, not a store of our own. That is
// what makes Reset to defaults forget it without any wiring here, and what lets
// the Tune this app row (<DefaultViewSelect>) and the viewer agree live: every
// `useDefaultView` with this id redraws when the row changes it.
export type PageScroll = 'vertical' | 'horizontal'

export const PAGE_SCROLL_ID = 'page-scroll'
export const PAGE_SCROLLS = ['vertical', 'horizontal'] as const

/**
 * What a device starts on until its owner picks one: horizontal in the phone
 * app and on a phone-width screen (the app's own `md` breakpoint, where the
 * page strip and the Pages drawer switch to their phone forms), vertical
 * everywhere else. Read when asked, not kept: a window dragged narrower picks
 * up the phone default on the next render that asks.
 */
export function pageScrollDefault(): PageScroll {
  if (typeof window === 'undefined') return 'vertical'
  if (isNativeShell()) return 'horizontal'
  return window.matchMedia?.('(max-width: 767px)').matches ? 'horizontal' : 'vertical'
}

/** The live setting, for a component. */
export function usePageScroll(): PageScroll {
  return useDefaultView<PageScroll>(PAGE_SCROLL_ID, pageScrollDefault(), { views: PAGE_SCROLLS }).defaultView
}

/** The setting outside React — a page jump fired from a link, say. */
export function readPageScroll(): PageScroll {
  const chosen = readDefaultView('pdf', PAGE_SCROLL_ID)
  return chosen === 'horizontal' || chosen === 'vertical' ? chosen : pageScrollDefault()
}

