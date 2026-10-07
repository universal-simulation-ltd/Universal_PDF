import { readDefaultView, useDefaultView } from '@unisim/sdk'

// Which way the open document's pages run: one under another (the default) or
// side by side in a row. Set in Tune this app ▸ Page scrolling.
//
// ⚠️ STORED THROUGH THE SDK'S DEFAULT-VIEW ROW, not a store of our own. That is
// what makes Reset to defaults forget it without any wiring here, and what lets
// the Tune this app row (<DefaultViewSelect>) and the viewer agree live: every
// `useDefaultView` with this id redraws when the row changes it.
export type PageScroll = 'vertical' | 'horizontal'

export const PAGE_SCROLL_ID = 'page-scroll'
export const PAGE_SCROLL_DEFAULT: PageScroll = 'vertical'
export const PAGE_SCROLLS = ['vertical', 'horizontal'] as const

/** The live setting, for a component. */
export function usePageScroll(): PageScroll {
  return useDefaultView<PageScroll>(PAGE_SCROLL_ID, PAGE_SCROLL_DEFAULT, { views: PAGE_SCROLLS }).defaultView
}

/** The setting outside React — a page jump fired from a link, say. */
export function readPageScroll(): PageScroll {
  return readDefaultView('pdf', PAGE_SCROLL_ID) === 'horizontal' ? 'horizontal' : 'vertical'
}

