import { readDefaultView, useDefaultView } from '@unisim/sdk'

// Which way the open document's pages run: one under another or side by side in
// a row. Set in Tune this app ▸ Page scrolling. Side by side by default on
// every device — first on phones (James, 2026-10-12: "the default scroll to be
// horizontal on mobile"), then on the web and the desktop app too, later the
// same day ("on web / desktop the default should be horizontal scroll on
// multiple pages too").
//
// ⚠️ STORED THROUGH THE SDK'S DEFAULT-VIEW ROW, not a store of our own. That is
// what makes Reset to defaults forget it without any wiring here, and what lets
// the Tune this app row (<DefaultViewSelect>) and the viewer agree live: every
// `useDefaultView` with this id redraws when the row changes it.
export type PageScroll = 'vertical' | 'horizontal'

export const PAGE_SCROLL_ID = 'page-scroll'
export const PAGE_SCROLLS = ['vertical', 'horizontal'] as const

/**
 * What a device starts on until its owner picks one: horizontal, everywhere.
 * Kept as a function (not a constant) so the default can go back to depending
 * on the device without touching its callers.
 */
export function pageScrollDefault(): PageScroll {
  return 'horizontal'
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

