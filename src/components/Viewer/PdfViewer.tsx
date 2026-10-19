import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePdfStore } from '../../stores/pdfStore'
import { registerViewProvider, takeRestoredView } from '../../lib/viewMemory'
import { useAnnotationStore } from '../../stores/annotationStore'
import { useSearchStore } from '../../stores/searchStore'
import FileNameEditor from '../Header/FileNameEditor'
import FindBar from './FindBar'
import PdfPage from './PdfPage'
import { budgetedPageCount, maxZoomForDocument, MAX_RETAINED_PAGES } from '../../lib/renderBudget'
import { setAnchorPage } from '../../lib/renderQueue'
import { useT } from '../../i18n'
import { usePageScroll } from '../../lib/pageScroll'
import type { PDFPageProxy } from '../../lib/pdfjs'

// "100% zoom" in standard PDF viewers means physical paper size on screen.
// CSS treats 1 inch as 96 px while a PDF point is 1/72 inch, so to render at
// real-world size we need a base scale of 96/72.
const BASE_SCALE = 96 / 72
const MIN_ZOOM = 0.25
// The ceiling the viewer will never go above. The ceiling it actually uses is
// usually lower — see `maxZoomForDocument`, which works out what this document
// can be rasterized at on this device without the web view being killed for
// holding too much canvas. Pinching, ctrl+wheel and the + button all clamp to
// that one, not to this.
const MAX_ZOOM = 4
const ZOOM_STEP = 0.1
// Fit-to-height on open never zooms out past this — below 75% body text gets
// too small to read, so very tall pages start partially off-screen instead.
const FIT_HEIGHT_MIN_ZOOM = 0.75
// With Page scrolling horizontal, the fit on open leaves this much height for
// the row's sideways scrollbar (a classic Windows one is ~17px; an overlay one
// takes none, and then the page is just a touch shy of the window).
const HORIZONTAL_SCROLLBAR_ALLOWANCE = 20
// With Page scrolling horizontal on a narrow screen, how much of the next
// page shows beside the one being read — see fitZoomFor.
const ROW_PEEK_PX = 20
// The least padding at either end of a row of pages — the row's padding is
// half the window less half of page 1, and never under this. One number for
// the layout and for the pinch, which has to predict where that layout will
// put the row (see `draw` in the pinch handler).
const ROW_END_MIN_PAD = 16
// Quick presets offered when you click the % label while at 100%.
const ZOOM_PRESETS = [50, 75, 125, 150]
// How long the pages wait for the fit-on-open zoom to be worked out before they
// are mounted at the current zoom regardless. See `fittedDoc`. Comfortably
// inside the store's FIRST_PAINT_GRACE_MS, so a document whose page 1 never
// resolves still has pages on screen by the time that hold lets go.
const FIT_TIMEOUT_MS = 600
// How long a zoom waits for the pages to re-lay-out before restoring the
// anchored scroll position anyway. Long enough for a page to re-rasterize on a
// slow phone, short enough that a zoom which doesn't move the layout box (or a
// page that fails to render) can't leave a pinch's transform stuck on screen.
const LAYOUT_SETTLE_MS = 400

export default function PdfViewer() {
  const t = useT()
  const doc = usePdfStore((s) => s.doc)
  const numPages = usePdfStore((s) => s.numPages)
  const isXfa = usePdfStore((s) => s.isXfa)
  const pageNavOpen = usePdfStore((s) => s.pageNavOpen)
  const togglePageNav = usePdfStore((s) => s.togglePageNav)
  const setPresentOpen = usePdfStore((s) => s.setPresentOpen)
  const tool = useAnnotationStore((s) => s.tool)
  const searchOpen = useSearchStore((s) => s.open)
  const setSearchOpen = useSearchStore((s) => s.setOpen)
  const resetSearch = useSearchStore((s) => s.reset)
  const [zoom, setZoom] = useState(1)
  const scale = zoom * BASE_SCALE
  useEffect(() => {
    useAnnotationStore.getState().setViewScale(scale)
  }, [scale])
  // Tune this app ▸ Page scrolling: the pages one under another (the default)
  // or side by side in a row. Everything below that reads the reading axis off
  // layout — the active band, the wheel, a returning tab's scroll — follows it.
  const horizontal = usePageScroll() === 'horizontal'
  const horizontalRef = useRef(horizontal)
  horizontalRef.current = horizontal
  // The page the reader is on, as the band last measured it — what a switch of
  // Page scrolling keeps them on. Down the screen that is the LEADING page (the
  // first whose middle has not scrolled past the top), not the one nearest the
  // middle: a short page under a tall one is not the page being read. Along a
  // row it IS the middle one, because the row centres its pages (see the
  // content's padding below) — the leading page there is the previous page
  // peeking in at the left edge.
  const readingPageRef = useRef(0)
  // The document the fit-on-open zoom below has been worked out for. Pages are
  // not mounted until it matches the open document, so page 1 is rasterized
  // ONCE, at the zoom it will be read at.
  //
  // ⚠️ Without this the viewer paints page 1 at the default 100% first, because
  // the fit needs `getPage(1)` and so lands a microtask later — and the store
  // releases its "page 1 is drawing" hold on that first paint. On a phone
  // opening a landscape PDF, 100% is far wider than the screen: the reader gets
  // a moment of the page zoomed in, then it snaps out to fit. Delaying the
  // mount instead puts that whole beat behind the placeholder that is already
  // up. See `firstPaint` in the store.
  const [fittedDoc, setFittedDoc] = useState<typeof doc>(null)
  const fitted = !!doc && fittedDoc === doc
  // Set when a tab comes back to the front: where its scroll box was, put back
  // once its pages are laid out tall enough to hold it. See lib/viewMemory.ts.
  const scrollToRestore = useRef<{ doc: typeof doc; top: number; left: number } | null>(null)
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false)
  const zoomMenuRef = useRef<HTMLDivElement>(null)

  // Keep a ref to the current zoom so the long-lived touch handlers below
  // can read it without re-binding on every change.
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  // How far this document can be zoomed on this device before the pages stop
  // fitting in memory. Only the band around the reader holds pixels, so it
  // falls as the document gets longer only up to `MAX_RETAINED_PAGES` pages;
  // it is measured off page 1 and re-measured whenever pages are added or
  // removed.
  const [maxZoom, setMaxZoom] = useState(MAX_ZOOM)
  const maxZoomRef = useRef(maxZoom)
  maxZoomRef.current = maxZoom

  useEffect(() => {
    if (!doc) return
    let cancelled = false
    doc.getPage(1).then((page) => {
      if (cancelled) return
      const { width, height } = page.getViewport({ scale: BASE_SCALE })
      // ⚠️ Pages HELD AT ONCE, not the document's length — only the band around
      // the reader holds canvases. Charging the ceiling for all N pages is what
      // pinned every long document to 100% whatever the device could hold.
      setMaxZoom(maxZoomForDocument(width, height, budgetedPageCount(numPages), MAX_ZOOM))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [doc, numPages])

  // The band of pages that carry their interactive layers — see `PdfPage`'s
  // `active`. Measured from layout rather than fixed at "the anchor ± N",
  // because how many pages are on screen at once is a function of the zoom: at
  // 25% on a tall display it is nine or ten, and a fixed radius of four would
  // leave the pages at the top and bottom of the reader's own screen without
  // their annotations. The band is what is visible, plus a screen's worth
  // either side so it is already there when they scroll into it.
  const [active, setActive] = useState<{ from: number; to: number }>({ from: 0, to: 4 })
  // ⚠️ A ceiling regardless, so no layout — a document mid-load whose pages are
  // all still zero-height and stacked at the same y — can put the whole
  // document back in the band and bring the eight seconds back with it.
  //
  // ⚠️ Derived from the budget's `MAX_RETAINED_PAGES` rather than chosen here:
  // the band IS what the memory budget is divided by, so a band wider than the
  // budget expects would silently overspend, and being killed for holding too
  // much canvas is not an error anyone sees — the web view simply reloads.
  const MAX_ACTIVE_RADIUS = Math.floor((MAX_RETAINED_PAGES - 1) / 2)

  // ⚠️ The band has to be re-measured when a page TAKES ITS SIZE, not only when
  // the reader scrolls. Early in a load every page is still zero-height and
  // stacked at the same y, so the first measurement can only see a handful —
  // and now that the band decides which pages hold a bitmap at all, a band left
  // at that first reading would leave the rest of the first screenful blank
  // for ever. `notifySized` calls this; it is a ref because that lives further
  // down the component than this effect does.
  const remeasureBand = useRef<(() => void) | null>(null)

  // Tell the render queue which page the reader is nearest, so rasterization
  // follows them. Without it the queue would always work outwards from page 1,
  // and jumping to page 300 of a long document would sit blank behind 299 pages
  // that have already been scrolled past. See `renderQueue`.
  //
  // ⚠️ Read from layout rather than from arithmetic on `scrollTop`: pages are
  // only as tall as their own viewport once `getPage` has resolved, so early in
  // a load the container's height is still growing and any ratio taken off it
  // points at the wrong page.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !doc) return
    let frame = 0

    function update() {
      frame = 0
      const box = el!.getBoundingClientRect()
      // Measured along the way the pages run: down the screen, or across it
      // when Page scrolling is horizontal.
      const along = horizontal
        ? (r: DOMRect) => ({ start: r.left, size: r.width })
        : (r: DOMRect) => ({ start: r.top, size: r.height })
      const view = along(box)
      const mid = view.start + view.size / 2
      // One screen of margin either side: a page enters the band before it can
      // be scrolled into view, so its layers are never seen arriving.
      const margin = view.size
      let best = 0
      let bestDist = Infinity
      let leading = Infinity
      let first = Infinity
      let last = -Infinity
      for (const p of el!.querySelectorAll<HTMLElement>('[data-page-index]')) {
        const r = along(p.getBoundingClientRect())
        const i = Number(p.dataset.pageIndex)
        const d = Math.abs(r.start + r.size / 2 - mid)
        if (d < bestDist) {
          bestDist = d
          best = i
        }
        if (r.size && r.start + r.size / 2 >= view.start && i < leading) leading = i
        if (r.start + r.size > view.start - margin && r.start < view.start + view.size + margin) {
          if (i < first) first = i
          if (i > last) last = i
        }
      }
      setAnchorPage(best)
      readingPageRef.current = horizontal || leading === Infinity ? best : leading
      // Nothing intersected — every page is still zero-height, which is the
      // state a long document is in for its first frames. Fall back to a small
      // band around the anchor rather than to none at all.
      let from = first === Infinity ? best - 2 : first
      let to = last === -Infinity ? best + 2 : last
      // The anchor is always in its own band, and the band never runs further
      // than the ceiling in either direction.
      from = Math.max(0, best - MAX_ACTIVE_RADIUS, Math.min(from, best))
      to = Math.min(best + MAX_ACTIVE_RADIUS, Math.max(to, best))
      // Setting state to what it already holds is a no-op in React, so the
      // common case — scrolling within one page — costs nothing.
      setActive((prev) => (prev.from === from && prev.to === to ? prev : { from, to }))
    }
    function onScroll() {
      // Coalesced to a frame: this reads layout for every page, and a trackpad
      // fling delivers scroll events far faster than that is worth doing.
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    el.addEventListener('scroll', onScroll, { passive: true })
    remeasureBand.current = onScroll
    return () => {
      el.removeEventListener('scroll', onScroll)
      remeasureBand.current = null
      if (frame) cancelAnimationFrame(frame)
    }
    // ⚠️ `fitted` is a dependency because the pages only exist once it is true:
    // measured before that, the band is read off an empty container.
  }, [doc, fitted, horizontal])

  // Switching Page scrolling with a document open keeps the reader on the page
  // they were on. A layout effect, so the new layout is never painted at the
  // old scroll offset — which in the other axis points at some other page, or
  // at nothing. The band effect above re-measures on the same change.
  const lastLayout = useRef(horizontal)
  useLayoutEffect(() => {
    if (lastLayout.current === horizontal) return
    lastLayout.current = horizontal
    const el = scrollRef.current
    const page = el?.querySelector<HTMLElement>(`[data-page-index="${readingPageRef.current}"]`)
    if (!el || !page) return
    // Off the axis the pages no longer run along, back to the start: a scroll
    // across a vertical document means nothing once it is a row.
    if (horizontal) el.scrollTop = 0
    else el.scrollLeft = 0
    page.scrollIntoView({ block: 'start', inline: horizontal ? 'center' : 'nearest' })
    // …and re-fit the zoom the way opening does (2026-10-11): fitted to the
    // height in a row, so there is nothing to scroll up and down; the usual
    // fit one under another. Before this only OPENING fitted, so a document
    // already open stayed at its vertical zoom, taller than the row.
    // Anchored on the top-middle of the reading page as it now sits, so the
    // reader stays on that page while the pages take their new size.
    const openDoc = doc
    if (!openDoc) return
    let cancelled = false
    openDoc.getPage(1).then((first) => {
      if (cancelled || scrollRef.current !== el) return
      const fit = fitZoomFor(first, el, horizontal)
      pendingZoom.current?.finish()
      if (fit === null || Math.abs(fit - zoomRef.current) < 0.0005) return
      const target = el.querySelector<HTMLElement>(`[data-page-index="${readingPageRef.current}"]`)
      let anchor: ZoomAnchor | null = null
      if (target) {
        const box = el.getBoundingClientRect()
        const r = target.getBoundingClientRect()
        anchor = {
          pageIndex: Number(target.dataset.pageIndex),
          fx: 0.5,
          fy: 0,
          screenX: r.left + r.width / 2 - box.left,
          screenY: r.top - box.top,
        }
      }
      commitZoom(Math.min(maxZoomRef.current, fit), anchor, clearContentTransform)
    }).catch(() => { /* keep the zoom the reader had */ })
    return () => { cancelled = true }
    // ⚠️ Only on a switch: `doc` is read as it is at that render, and a new
    // document is fitted by the open path below instead.
  }, [horizontal])

  // Pages added to an already-zoomed document can push the ceiling below where
  // the zoom already is — come back down rather than sit over budget.
  useEffect(() => {
    if (zoomRef.current > maxZoom) setZoom(maxZoom)
  }, [maxZoom])

  // Close the zoom-presets menu on outside-click / Escape, and whenever the
  // zoom leaves 100% (the presets menu only applies at 100%).
  useEffect(() => {
    if (!zoomMenuOpen) return
    function onDown(e: MouseEvent) {
      if (zoomMenuRef.current && !zoomMenuRef.current.contains(e.target as Node)) setZoomMenuOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setZoomMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [zoomMenuOpen])

  useEffect(() => {
    if (Math.round(zoom * 100) !== 100) setZoomMenuOpen(false)
  }, [zoom])

  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // A committed zoom only reaches the DOM once every page has re-rasterized and
  // reported its new size, a frame or two after the state changes. Until then
  // the container still has its old scroll extent, so the scroll that keeps the
  // zoom anchored waits here rather than being applied early and clamped — that
  // clamping is what kicks the document sideways when you zoom.
  const pendingZoom = useRef<{ finish: () => void; cancel: () => void } | null>(null)

  // Where a point of the document sits, in terms that survive a re-render at a
  // different scale: which page, where inside that page as a fraction of its
  // box, and where on screen (relative to the scroll container) it should still
  // be once the zoom lands. Anchoring on the page itself rather than on scroll
  // arithmetic is what makes the landing exact — the padding, the gaps between
  // pages and the centring of a page narrower than the window all scale
  // differently from the pages, and a ratio applied to scrollTop knows about
  // none of them.
  interface ZoomAnchor {
    pageIndex: number
    fx: number
    fy: number
    screenX: number
    screenY: number
  }

  function captureAnchor(el: HTMLDivElement, screenX: number, screenY: number): ZoomAnchor | null {
    const box = el.getBoundingClientRect()
    const x = box.left + screenX
    const y = box.top + screenY
    let best: HTMLElement | null = null
    let bestDist = Infinity
    // Nearest page, so an anchor landing in the gap between two pages or in the
    // margin beside one still has something to hold on to.
    for (const p of el.querySelectorAll<HTMLElement>('[data-page-index]')) {
      const r = p.getBoundingClientRect()
      if (!r.width || !r.height) continue
      const d = Math.hypot(
        Math.max(r.left - x, 0, x - r.right),
        Math.max(r.top - y, 0, y - r.bottom)
      )
      if (d < bestDist) {
        bestDist = d
        best = p
      }
    }
    if (!best) return null
    const r = best.getBoundingClientRect()
    return {
      pageIndex: Number(best.dataset.pageIndex),
      fx: (x - r.left) / r.width,
      fy: (y - r.top) / r.height,
      screenX,
      screenY
    }
  }

  interface RowLayout {
    width: number
    pad: number
    gap: number
    pages: number
    firstPageWidth: number
    // The anchored page: its position in the row, and its left edge from
    // the row's own left edge.
    anchorIndex: number
    anchorLeft: number
  }
  // How the row is laid out right now, untransformed. Null when the pages
  // run down the screen, or there is no anchor page to measure from.
  function measureRow(content: HTMLDivElement, anchor: ZoomAnchor | null): RowLayout | null {
    if (!horizontalRef.current || !anchor) return null
    const pages = content.querySelectorAll<HTMLElement>('[data-page-index]')
    const page = content.querySelector<HTMLElement>(`[data-page-index="${anchor.pageIndex}"]`)
    if (!pages.length || !page) return null
    const style = getComputedStyle(content)
    return {
      width: content.offsetWidth,
      pad: parseFloat(style.paddingLeft) || 0,
      gap: parseFloat(style.columnGap) || 0,
      pages: pages.length,
      firstPageWidth: pages[0].offsetWidth,
      anchorIndex: anchor.pageIndex,
      anchorLeft: page.getBoundingClientRect().left - content.getBoundingClientRect().left
    }
  }

  // Where a gesture's transform holds the document: scaled by `g.ratio` about
  // the point it began on and, with the pages in a row, kept where the commit
  // will be able to put them. Shared by the touch pinch and the trackpad's
  // ctrl+wheel. ⚠️ The trackpad once kept its own copy of the anchor
  // arithmetic without the two row clamps below, so a desktop pinch on page 1
  // (or the last page) jumped sideways when it landed — 92px in
  // pinch-zoom.e2e (James, 2026-10-19, a screen recording of Universal PDF
  // on Windows). One function, so the two cannot drift apart again.
  interface GestureHold {
    anchorX: number
    anchorY: number
    scrollLeft: number
    scrollTop: number
    ratio: number
    row: RowLayout | null
  }
  function gestureTransform(el: HTMLDivElement, content: HTMLDivElement, g: GestureHold): string {
    // Read back what the container would actually accept, and let the
    // translation absorb the difference: whatever the scroll ends up being,
    // the anchored point stays exactly under the fingers.
    //
    // Scaling about the anchor, with the transform origin at the content's
    // top-left: the anchored point is (scroll at the start + anchor), less
    // where the content box itself starts, in content coordinates — and this
    // translation is what holds it in place.
    //
    // ⚠️ `offsetTop`/`offsetLeft` are NOT always 0. The content is centred in
    // the viewport with auto margins whenever it is smaller than the viewport
    // (see the wrapper's own comment), which is exactly the case a pinch on a
    // phone starts from. Dropping them scales about a point the margin's
    // height away from the fingers, so the document slides out from under
    // them as it grows.
    const anchoredX = g.scrollLeft + g.anchorX - content.offsetLeft
    const anchoredY = g.scrollTop + g.anchorY - content.offsetTop
    let tx = g.anchorX + el.scrollLeft - content.offsetLeft - g.ratio * anchoredX
    let ty = g.anchorY + el.scrollTop - content.offsetTop - g.ratio * anchoredY
    // ⚠️ PAGES IN A ROW: KEEP THE ROW WHERE THE COMMIT WILL PUT IT, UP AND
    // DOWN (2026-10-12). Across the row there is only one page's height of
    // document, so the anchor can ask for a place no scroll reaches: pinched
    // smaller than the window, the committed row is centred by its auto
    // margins; pinched just taller, it can only scroll so far. Held at the
    // anchor, the row then jumped (59px in pinch-zoom.e2e) the moment the
    // fingers lifted. So the content's top edge, as the commit will lay it
    // out, is clamped into what that layout can show — centred when it fits,
    // inside the scroll range when it doesn't — and the row eases there as
    // the fingers move. Phones open in a row by default now, so this is the
    // ordinary pinch on a phone. The padding (py-6) doesn't scale on commit
    // but does under the transform, hence the two `pad` terms.
    if (horizontalRef.current) {
      const pad = 24
      const viewH = el.clientHeight
      const committedH = (content.offsetHeight - 2 * pad) * g.ratio + 2 * pad
      const anchoredTop = content.offsetTop - el.scrollTop + ty + pad * g.ratio - pad
      const top = committedH <= viewH
        ? (viewH - committedH) / 2
        : Math.min(0, Math.max(viewH - committedH, anchoredTop))
      ty += top - anchoredTop
    }
    // ⚠️ …AND ACROSS, AT EITHER END OF THE ROW (James, 2026-10-19: "When
    // zooming in and out the page jumps to the right for some reason"). The
    // same trap sideways: page 1 can never sit right of the middle of the
    // window (the row's padding is what centres it, and there is no scroll
    // left of 0), and the last page can never sit left of it. Pinched about a
    // point that asks for either, the gesture held the page there and the
    // commit then scrolled as far as it could and stopped short — the page
    // jumped on release, to the RIGHT on the last page (and on a one-page
    // document), to the left on page 1; 21px for a pinch left of centre on
    // the example's last page. So, as up and down: where the commit will be
    // able to put the anchored page is worked out from the row as it was
    // laid out when the fingers landed, and the page is held inside that.
    //
    // The arithmetic mirrors the row's layout rather than scaling it: the
    // pages scale, but the gaps between them do not, and the end padding is
    // re-derived from the new width of page 1 (see the content's style).
    const row = g.row
    if (row) {
      const r = g.ratio
      const viewW = el.clientWidth
      const gaps = row.gap * (row.pages - 1)
      const pad = Math.max(ROW_END_MIN_PAD, viewW / 2 - (row.firstPageWidth * r) / 2)
      const committedW = 2 * pad + r * (row.width - 2 * row.pad - gaps) + gaps
      const before = row.gap * row.anchorIndex
      const committedLeft = pad + r * (row.anchorLeft - row.pad - before) + before
      // A row narrower than the window is centred by its auto margins and
      // cannot scroll; a wider one starts at 0 and scrolls this far.
      const offset = committedW < viewW ? (viewW - committedW) / 2 : 0
      const maxScroll = Math.max(0, committedW - viewW)
      const heldLeft = content.offsetLeft - el.scrollLeft + tx + r * row.anchorLeft
      const lo = offset + committedLeft - maxScroll
      const hi = offset + committedLeft
      tx += Math.min(hi, Math.max(lo, heldLeft)) - heldLeft
    }
    return `translate(${tx}px, ${ty}px) scale(${g.ratio})`
  }

  function restoreAnchor(el: HTMLDivElement, a: ZoomAnchor) {
    const page = el.querySelector<HTMLElement>(`[data-page-index="${a.pageIndex}"]`)
    if (!page) return
    const box = el.getBoundingClientRect()
    const r = page.getBoundingClientRect()
    el.scrollLeft += r.left + a.fx * r.width - box.left - a.screenX
    el.scrollTop += r.top + a.fy * r.height - box.top - a.screenY
  }

  // Page 1's width as the row of pages is padded by it: `--doc-display-width`,
  // which centres page 1 in the window (the content's paddingInline) and
  // lines the desktop toolbar up with the document.
  //
  // ⚠️ SET IN THE SAME COMMIT AS PAGE 1'S NEW SIZE, NEVER LATER (James,
  // 2026-10-19, on the iPhone: "see how it jumps on zoom"). It used to be
  // removed by a zoom's effect cleanup and set again from `doc.getPage(1)`'s
  // promise — so for the moment in between the row was padded by HALF THE
  // WINDOW. The pages took their new size in that gap, the committed zoom
  // put the fingers' point back under them against that padding, and then
  // the variable landed and the padding shrank back: every page slid
  // sideways by the difference, 181px on a 393px iPhone pinching page 1 up
  // to about 2x, after the fingers had lifted. Published from the page's own
  // size report instead, the padding and the page change together and the
  // anchor is restored against the layout that stays.
  const displayWidthRef = useRef('')
  function publishDisplayWidth(width: number) {
    const value = `${width}px`
    if (value === displayWidthRef.current) return
    displayWidthRef.current = value
    document.documentElement.style.setProperty('--doc-display-width', value)
  }

  // Pages report a new box size here, from a LAYOUT effect — synchronously
  // after React writes it and before the browser paints. A settling zoom
  // listens; see `commitZoom`.
  const sizeListeners = useRef(new Set<() => void>())
  const notifySized = useCallback((pageIndex: number, width: number) => {
    // Page 1's width pads the row of pages (see the content's style), so it
    // is published HERE, in the commit that gave page 1 its new size and
    // before any listener measures the layout. See `publishDisplayWidth`.
    if (pageIndex === 0) publishDisplayWidth(width)
    // Copy first: a listener that finishes removes itself mid-iteration.
    for (const fn of [...sizeListeners.current]) fn()
    // A page taking its size changes which pages are on screen — see
    // `remeasureBand`. Coalesced to a frame by the handler itself.
    remeasureBand.current?.()
  }, [])

  // Commit a zoom and put the anchored point back under the cursor or the
  // fingers once the pages have taken their new size, running `done` in that
  // same frame — so the viewer never paints a half-applied zoom. The timer
  // covers a zoom too small to move the layout box at all.
  //
  // ── ⚠️ WHY THIS IS NOT A ResizeObserver ANY MORE ────────────────────────────
  //
  // It was, and it flashed. A trackpad pinch released at 1.7× painted one frame
  // **1.716× too big** before settling — captured per-frame, because polling at
  // 25–40 ms misses it entirely and reports a clean pass:
  //
  //     t=886   seen 1445  layout 1756  scale(1.716)   the gesture, correct
  //     t=1046  seen 2479  layout 2962  scale(1.716)   layout landed, still scaled
  //     t=1059  seen 1445  layout 2962  none           settled
  //
  // ResizeObserver delivers after layout and before paint *of the frame it
  // notices in* — but a page's size is set from `doc.getPage()`'s promise,
  // which resolves at an arbitrary point in a frame and routinely lands AFTER
  // that frame's observer-delivery step. The frame then paints the grown layout
  // still wearing the gesture's transform, and the observer reports a frame
  // late. Nothing scheduled from the observer can be early enough, because the
  // bad paint already happened.
  //
  // A `requestAnimationFrame` loop has the same defect for the same reason: rAF
  // runs before the mutation, not after it.
  //
  // The one callback that runs inside the same commit as the size write is a
  // LAYOUT EFFECT in the page itself, which is what `onSized` is.
  //
  // ── ⚠️ AND WHY IT COMPENSATES RATHER THAN JUST FINISHING ────────────────────
  //
  // Pages do not all resize in one commit. An earlier attempt at this dropped
  // the transform on the first report and snapped the document small, because
  // the layout was still on its way — measured mid-flight at 1159px of an
  // eventual 1435px. So each report re-measures and asks how much of the growth
  // has actually arrived: the residual `k` is the scale still needed to keep
  // what is on screen the same size. `k` starts at the gesture's own ratio and
  // reaches 1 exactly when the layout has finished. Every intermediate paint is
  // therefore correct rather than merely brief.
  function commitZoom(newZoom: number, anchor: ZoomAnchor | null, done?: () => void) {
    pendingZoom.current?.cancel()
    const prevZoom = zoomRef.current
    // Track the zoom here as well as in state so a burst of events inside one
    // frame compounds instead of each one re-reading a stale zoom.
    zoomRef.current = newZoom
    setZoom(newZoom)
    const el = scrollRef.current
    const content = contentRef.current
    if (!el || !content || !anchor) {
      done?.()
      return
    }
    const startHeight = content.offsetHeight
    const startWidth = content.offsetWidth
    const growth = prevZoom > 0 ? newZoom / prevZoom : 1

    // ⚠️ MEASURE A PAGE, NOT THE CONTENT WRAPPER. A page's box comes straight
    // from `getViewport({ scale })`, so it really is proportional to the zoom
    // and "where it is heading" is exactly `startPageHeight * growth`. The
    // wrapper is not: it also carries the padding and the fixed gaps between
    // pages, which do not scale. Predicting from the wrapper left a residual
    // `scale(1.017)` sitting on the document — small enough to look settled in
    // a screenshot, and it hung there for the full 400 ms timeout because the
    // arithmetic could never reach 1.
    const pageEl = () =>
      el.querySelector<HTMLElement>(`[data-page-index="${anchor.pageIndex}"]`)
    const startPageHeight = pageEl()?.offsetHeight ?? 0
    const targetPageHeight = startPageHeight * growth

    let timer: ReturnType<typeof setTimeout> | null = null
    const teardown = () => {
      sizeListeners.current.delete(onSized)
      if (timer) clearTimeout(timer)
      pendingZoom.current = null
    }
    const finish = () => {
      teardown()
      // `done` drops the gesture's transform first: the anchor is measured off
      // the real, committed layout, and both land before this frame paints.
      done?.()
      restoreAnchor(el, anchor)
    }

    // The last page height acted on, so a report that changes nothing can be
    // told apart from one that has stopped changing.
    let lastPageHeight = startPageHeight

    function onSized() {
      // Nothing has moved yet — the first report can be a page re-reporting the
      // size it already had.
      if (
        content!.offsetHeight === startHeight &&
        content!.offsetWidth === startWidth
      ) {
        return
      }
      const ph = pageEl()?.offsetHeight ?? 0
      // No page to measure (a document that failed to render) — the wrapper
      // moved, so the layout is in as far as anything here can tell.
      if (!ph || !targetPageHeight) {
        finish()
        return
      }
      // The layout has stopped moving without reaching the prediction. Trust
      // the measurement over the arithmetic and settle, rather than holding a
      // compensating transform until the timeout.
      const stalled = ph === lastPageHeight
      lastPageHeight = ph
      const k = targetPageHeight / ph
      // Close enough that a compensating transform would be sub-pixel: the
      // layout has arrived, so hand over to the real thing.
      if (stalled || (!(k > 1.002) && !(k < 0.998))) {
        finish()
        return
      }
      // Still growing. Hold the picture at the size the gesture left it by
      // scaling about the anchored point — with the origin ON that point, no
      // translate is needed and the anchor cannot drift as the layout shifts
      // underneath it.
      done?.()
      restoreAnchor(el!, anchor!)
      // Same content-coordinate conversion as the gestures' `draw()`:
      // transform-origin is measured from the content's own box, which the
      // centring margins move away from the scroll origin.
      content!.style.transformOrigin = `${el!.scrollLeft + anchor!.screenX - content!.offsetLeft}px ${el!.scrollTop + anchor!.screenY - content!.offsetTop}px`
      content!.style.transform = `scale(${k})`
    }

    sizeListeners.current.add(onSized)
    timer = setTimeout(finish, LAYOUT_SETTLE_MS)
    pendingZoom.current = { finish, cancel: teardown }
  }

  // Drop whatever transform a gesture (or a settling zoom's compensation) left on
  // the content. Shared by the buttons and the keyboard, which own no transform
  // of their own but still have to clear `commitZoom`'s.
  function clearContentTransform() {
    const content = contentRef.current
    if (!content) return
    content.style.transform = ''
    content.style.transformOrigin = ''
    content.style.willChange = ''
    releaseRowPadding(content)
  }

  // ⚠️ A GESTURE MUST NOT MOVE THE ROW UNDER ITS OWN TRANSFORM (James's Windows
  // recording, 2026-10-19). The row's end padding is a percentage of the
  // scroller's width, and on Windows a scrollbar TAKES width: the preview,
  // growing the page taller than the window, makes a vertical scrollbar
  // appear, the scroller loses 17px, and the padding — so every page — slides
  // 8.5px left, under the cursor, mid-pinch. Headless Chromium has overlay
  // scrollbars and never sees it; a real Electron window does. So for the
  // length of a gesture the padding is held at the pixels it resolved to when
  // the gesture began, and handed back to its percentage once the zoom has
  // landed (`clearContentTransform`), in the frame the transform comes off.
  const heldRowPadding = useRef<string | null>(null)
  function holdRowPadding(content: HTMLDivElement) {
    if (!horizontalRef.current || heldRowPadding.current !== null) return
    const style = getComputedStyle(content)
    heldRowPadding.current = content.style.paddingInline
    content.style.paddingInline = `${style.paddingLeft} ${style.paddingRight}`
  }
  function releaseRowPadding(content: HTMLDivElement) {
    if (heldRowPadding.current === null) return
    content.style.paddingInline = heldRowPadding.current
    heldRowPadding.current = null
  }

  // A zoom from the − / + / % buttons, the presets and the keyboard, anchored
  // on the middle of the viewport so the reader stays where they were.
  //
  // ⚠️ These used to call `setZoom` directly, which re-lays-out every page
  // about the document's TOP-LEFT: the scroll position stays put in pixels
  // while everything above it grows or shrinks, so deep in a long document a
  // single click of + or − moved the reader pages away. The pinch and
  // ctrl+wheel never did that because they go through `commitZoom` with an
  // anchor; now everything does.
  //
  // Reads refs, not state, so rapid clicks and held-down keys compound from
  // the zoom already committed rather than each re-reading a stale render's.
  function zoomAboutCentre(target: number) {
    const el = scrollRef.current
    const next = Math.max(MIN_ZOOM, Math.min(maxZoomRef.current, target))
    // Land a zoom still waiting on layout first, so this one measures itself
    // against the document as it really sits — same as the gestures do.
    pendingZoom.current?.finish()
    if (Math.abs(next - zoomRef.current) < 0.0005) return
    const anchor = el ? captureAnchor(el, el.clientWidth / 2, el.clientHeight / 2) : null
    commitZoom(next, anchor, clearContentTransform)
  }
  const zoomStepIn = () => zoomAboutCentre(+(zoomRef.current + ZOOM_STEP).toFixed(2))
  const zoomStepOut = () => zoomAboutCentre(+(zoomRef.current - ZOOM_STEP).toFixed(2))
  // What the % button does when it isn't opening the presets: back to 100%.
  const zoomReset = () => zoomAboutCentre(1)

  // Ctrl/Cmd + and − step the zoom, Ctrl/Cmd 0 puts it back to 100% — the
  // keys every browser and PDF reader uses, so they have to zoom the DOCUMENT
  // rather than the browser's page (which would scale the toolbars with it).
  //
  // ⚠️ NOT gated on the drawing tools the way the buttons are. The pinch and
  // ctrl+wheel both zoom mid-drawing, and the keyboard is the same intent.
  // It IS gated on typing — Ctrl+0 / Ctrl+− in a text box are the user's —
  // using the same test as the toolbar's shortcuts, and stands down while
  // Present or the export preview covers the viewer.
  //
  // Through refs and the anchored path above, so the handler is bound once.
  useEffect(() => {
    function isEditable(t: EventTarget | null): boolean {
      const el = t as HTMLElement | null
      if (!el || !el.tagName) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
    }
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      // `=` is + without Shift on most layouts; the numpad sends `+`/`-` too.
      const action =
        e.key === '+' || e.key === '=' ? zoomStepIn :
        e.key === '-' || e.key === '_' ? zoomStepOut :
        e.key === '0' ? zoomReset :
        null
      if (!action) return
      const pdf = usePdfStore.getState()
      if (!pdf.doc || pdf.presentOpen || pdf.previewOpen) return
      if (isEditable(document.activeElement)) return
      e.preventDefault()
      action()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pinch-to-zoom. While the fingers are down the pages are not re-rendered and
  // the document is not scrolled — it is only transformed — so the zoom tracks
  // the fingers at display rate instead of stuttering behind a re-rasterization
  // of every page, and the committed zoom lands in one step at the end.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    interface Pinch {
      // The finger spread this pair is measured from, and the scale the gesture
      // had already reached when they became the pair — a third finger joining
      // or leaving re-bases both, so the zoom carries on from where it is
      // instead of jumping to whatever the new spread would mean from the top.
      baseDist: number
      baseRatio: number
      initialZoom: number
      // Where the fingers' midpoint sat when the gesture began. The zoom stays
      // anchored there for the whole gesture: the midpoint drifts as fingers
      // move, and following it pans the document while it scales — two motions
      // competing for the same pixels, which is what makes a pinch look
      // jagged. A pinch zooms; it never pans.
      anchorX: number
      anchorY: number
      anchor: ZoomAnchor | null
      scrollLeft: number
      scrollTop: number
      ratio: number
      // Pages in a row only: the row as it was laid out when the gesture
      // began, measured once, so `draw` can work out where the commit will
      // put the row at any scale — see the sideways clamp there.
      row: RowLayout | null
    }
    let pinch: Pinch | null = null
    // Set when two fingers come down, cleared only when the LAST one lifts.
    // Lifting one finger ends the zoom, but the other is still on the glass
    // and usually still moving — and its touchmoves, no longer cancelled, are
    // free to start the browser scrolling the row under it: a pan (and on an
    // iPhone a fling) straight after the zoom commits, sliding the page out
    // from under the commit's own scroll correction. Chromium happens not to
    // scroll there (pinch-zoom.e2e can't make it), WebKit's rules for a touch
    // sequence that stops being cancelled are its own; cancelling the rest of
    // the sequence settles it either way (2026-10-19).
    let fingersFromPinch = false
    let frame = 0

    function dist(t1: Touch, t2: Touch) {
      return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY)
    }

    const clearTransform = clearContentTransform

    function draw() {
      frame = 0
      const content = contentRef.current
      if (!pinch || !el || !content) return
      // Put the scroll back where the gesture found it. A scroll the browser
      // began before the second finger landed can no longer be
      // preventDefault()ed away, and scaling the content down shrinks the
      // scrollable area under a container that was scrolled near its end,
      // which makes the browser clamp — either way the document must not
      // wander while it is being scaled.
      if (el.scrollLeft !== pinch.scrollLeft) el.scrollLeft = pinch.scrollLeft
      if (el.scrollTop !== pinch.scrollTop) el.scrollTop = pinch.scrollTop
      content.style.transform = gestureTransform(el, content, pinch)
    }

    function onStart(e: TouchEvent) {
      if (e.touches.length !== 2 || !el) return
      // Announce the pinch so the annotation layer can abandon whatever the
      // first finger had started — a two-finger gesture is a zoom and nothing
      // else, never a zoom plus a half-committed drag.
      usePdfStore.getState().setPinching(true)
      // Land a zoom still waiting on layout so this gesture measures itself
      // against the document as it really sits.
      pendingZoom.current?.finish()
      const [t1, t2] = [e.touches[0], e.touches[1]]
      const rect = el.getBoundingClientRect()
      const anchorX = (t1.clientX + t2.clientX) / 2 - rect.left
      const anchorY = (t1.clientY + t2.clientY) / 2 - rect.top
      const anchor = captureAnchor(el, anchorX, anchorY)
      const content = contentRef.current
      fingersFromPinch = true
      pinch = {
        baseDist: dist(t1, t2),
        baseRatio: 1,
        initialZoom: zoomRef.current,
        anchorX,
        anchorY,
        // The gesture holds this point of the document under the midpoint the
        // whole way — the transform below scales about it, and the commit
        // scrolls it back under it once the pages have re-rendered.
        anchor,
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
        ratio: 1,
        row: content ? measureRow(content, anchor) : null
      }
      if (content) {
        holdRowPadding(content)
        content.style.transformOrigin = '0 0'
        content.style.willChange = 'transform'
      }
    }

    function onMove(e: TouchEvent) {
      // The finger left behind by a pinch is still part of the pinch: it
      // neither scrolls nor flings the row. See `fingersFromPinch`.
      if (!pinch && fingersFromPinch) {
        if (e.cancelable) e.preventDefault()
        return
      }
      if (!pinch || e.touches.length !== 2 || !el) return
      if (e.cancelable) e.preventDefault()
      const [t1, t2] = [e.touches[0], e.touches[1]]
      const spread = (dist(t1, t2) / pinch.baseDist) * pinch.baseRatio
      const newZoom = Math.max(MIN_ZOOM, Math.min(maxZoomRef.current, pinch.initialZoom * spread))
      pinch.ratio = newZoom / pinch.initialZoom
      // One transform write per frame, however fast the touchmoves arrive.
      if (!frame) frame = requestAnimationFrame(draw)
    }

    function onEnd(e: TouchEvent) {
      // Stay in "pinching" until every finger is off the glass. Lifting just
      // one would otherwise hand the remaining finger straight back to the
      // annotation layer mid-gesture, which is exactly the accidental drag
      // this flag exists to prevent.
      if (e.touches.length === 0) {
        usePdfStore.getState().setPinching(false)
        fingersFromPinch = false
      }
      if (!pinch) return
      if (e.touches.length >= 2) {
        // Still a pinch, just with different fingers: carry the scale reached
        // so far over to the new pair rather than restarting from their spread.
        pinch.baseRatio = pinch.ratio
        pinch.baseDist = dist(e.touches[0], e.touches[1])
        return
      }
      const { initialZoom, ratio, anchor } = pinch
      pinch = null
      if (frame) {
        cancelAnimationFrame(frame)
        frame = 0
      }
      if (ratio === 1) {
        clearTransform()
        return
      }
      // Hold the transform on screen until the pages have re-rendered at the
      // committed zoom, so the sharp render replaces the scaled one in a single
      // frame instead of flashing through the un-zoomed layout.
      commitZoom(initialZoom * ratio, anchor, clearTransform)
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
      if (frame) cancelAnimationFrame(frame)
      pendingZoom.current?.cancel()
      clearTransform()
      usePdfStore.getState().setPinching(false)
    }
  }, [])

  // Ctrl/Cmd+Wheel zooms the PDF instead of the browser page. A touchpad pinch
  // lands here too — as a stream of ctrl+wheel events, dozens a second — and
  // committing every tick used to re-rasterize every page per tick, flooding
  // the main thread for minutes and leaving pages blank mid-burst. So the
  // stream is treated exactly like the touch pinch above: the document is
  // scaled with a CSS transform while ticks keep arriving, and the zoom
  // commits ONCE when they pause.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    interface WheelGesture {
      initialZoom: number
      ratio: number
      anchorX: number
      anchorY: number
      anchor: ZoomAnchor | null
      scrollLeft: number
      scrollTop: number
      row: RowLayout | null
    }
    let gesture: WheelGesture | null = null
    let frame = 0
    let settle: ReturnType<typeof setTimeout> | null = null
    // How long the stream must go quiet before the zoom commits. A touchpad
    // emits ticks continuously through a pinch, so this is beyond its
    // inter-event gap — but short enough that a single ctrl+wheel notch on a
    // mouse still feels immediate.
    const SETTLE_MS = 120

    const clearTransform = clearContentTransform

    // The pinch's draw(), cursor for fingers: pin the scroll where the gesture
    // found it and hold the anchored point under the cursor, inside what the
    // commit can reach (`gestureTransform`).
    function draw() {
      frame = 0
      const content = contentRef.current
      if (!gesture || !el || !content) return
      if (el.scrollLeft !== gesture.scrollLeft) el.scrollLeft = gesture.scrollLeft
      if (el.scrollTop !== gesture.scrollTop) el.scrollTop = gesture.scrollTop
      content.style.transform = gestureTransform(el, content, gesture)
    }

    function commit() {
      settle = null
      if (!gesture) return
      const { initialZoom, ratio, anchor } = gesture
      gesture = null
      if (frame) {
        cancelAnimationFrame(frame)
        frame = 0
      }
      if (ratio === 1) {
        clearTransform()
        return
      }
      // Hold the transform until the pages re-render at the committed zoom, so
      // the sharp render replaces the scaled one in a single frame.
      commitZoom(initialZoom * ratio, anchor, clearTransform)
    }

    function onWheel(e: WheelEvent) {
      if (!el) return
      if (!e.ctrlKey && !e.metaKey) {
        // Pages in a row: a mouse wheel only turns up and down, so on its own
        // it would never reach page 2. It scrolls down the page as usual and,
        // once there is no more room that way, carries on along the row —
        // down/right, up/left. ⚠️ "No more room", not "no room at all": the
        // fit on open floors at 75%, so a portrait page is often a little
        // taller than the window, and a rule that only walked the row when
        // nothing could scroll vertically left the wheel stuck on page 1.
        // A trackpad's own sideways swipe (deltaX) is always left alone.
        if (horizontalRef.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          const roomDown = el.scrollHeight - el.clientHeight - el.scrollTop
          const atEdge = e.deltaY > 0 ? roomDown <= 1 : el.scrollTop <= 0
          if (atEdge) {
            e.preventDefault()
            // deltaMode 1 is lines (Firefox with a mouse wheel), 2 is pages.
            const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientWidth : 1
            el.scrollLeft += e.deltaY * unit
          }
        }
        return
      }
      e.preventDefault()
      if (!gesture) {
        // Land a zoom still waiting on layout so this gesture measures itself
        // against the document as it really sits.
        pendingZoom.current?.finish()
        const rect = el.getBoundingClientRect()
        const anchorX = e.clientX - rect.left
        const anchorY = e.clientY - rect.top
        const anchor = captureAnchor(el, anchorX, anchorY)
        const content = contentRef.current
        gesture = {
          initialZoom: zoomRef.current,
          ratio: 1,
          anchorX,
          anchorY,
          anchor,
          scrollLeft: el.scrollLeft,
          scrollTop: el.scrollTop,
          row: content ? measureRow(content, anchor) : null
        }
        if (content) {
          holdRowPadding(content)
          content.style.transformOrigin = '0 0'
          content.style.willChange = 'transform'
        }
      }
      const zoomDelta = -e.deltaY * 0.001
      const target = Math.max(
        MIN_ZOOM,
        Math.min(maxZoomRef.current, gesture.initialZoom * gesture.ratio * Math.exp(zoomDelta))
      )
      gesture.ratio = target / gesture.initialZoom
      if (!frame) frame = requestAnimationFrame(draw)
      if (settle) clearTimeout(settle)
      settle = setTimeout(commit, SETTLE_MS)
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      if (settle) clearTimeout(settle)
      if (frame) cancelAnimationFrame(frame)
      // Anything mid-gesture commits now, so the transform never outlives the
      // handler that owns it.
      commit()
    }
  }, [])

  // Hand-tool drag-to-pan
  useEffect(() => {
    if (tool !== 'hand') return
    const el = scrollRef.current
    if (!el) return

    let dragging = false
    let startX = 0
    let startY = 0
    let startScrollLeft = 0
    let startScrollTop = 0

    function onDown(e: PointerEvent) {
      if (!el) return
      if (e.button !== 0 && e.pointerType === 'mouse') return
      // A pinch owns the scroll position (it anchors the zoom on the midpoint),
      // so a pan running alongside it would fight the same two properties.
      if (usePdfStore.getState().pinching) return
      dragging = true
      startX = e.clientX
      startY = e.clientY
      startScrollLeft = el.scrollLeft
      startScrollTop = el.scrollTop
      el.setPointerCapture(e.pointerId)
    }
    function onMove(e: PointerEvent) {
      if (!dragging || !el) return
      // A pinch that starts mid-pan takes over: drop the pan rather than
      // scrolling against the zoom's own scroll correction.
      if (usePdfStore.getState().pinching) {
        dragging = false
        return
      }
      el.scrollLeft = startScrollLeft - (e.clientX - startX)
      el.scrollTop = startScrollTop - (e.clientY - startY)
    }
    function onUp(e: PointerEvent) {
      if (!el) return
      dragging = false
      try { el.releasePointerCapture(e.pointerId) } catch { /* noop */ }
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
    }
  }, [tool])

  // The zoom that fits page 1 into the viewer — what a document opens at, and
  // what switching Page scrolling re-fits to (2026-10-11). Null when the viewer
  // has no size to fit into yet.
  function fitZoomFor(page: PDFPageProxy, el: HTMLDivElement, inRow: boolean): number | null {
    const { width: pageWidth, height: pageHeight } = page.getViewport({ scale: BASE_SCALE })
    const availableW = el.clientWidth - 32 // px-4 padding × 2
    const availableH = el.clientHeight - 48 // py-6 padding × 2
    if (inRow && availableH > HORIZONTAL_SCROLLBAR_ALLOWANCE) {
      // Pages in a row: fit the HEIGHT alone, so there is nothing to scroll
      // up and down and the wheel walks straight along the row (James,
      // 2026-10-08). No 75% floor (that floor is what left a portrait page a
      // little taller than the window) and no width cap (the row scrolls
      // sideways anyway). Less room for the row's own scrollbar, which only
      // appears once the pages mount.
      // …and no WIDER than the window either (2026-10-12). A phone in
      // portrait starts in a row now, and fitted to the height alone an A4
      // page came out ~460px wide on a 390px screen, its right edge cut off.
      // A page is the unit a swipe moves by, so it must fit whole; on a
      // computer the height is always the tighter of the two.
      // …and, where the WIDTH is what binds (a phone), narrow enough that the
      // next page's edge shows past the gap, so it is plain there are more
      // pages and which way they lie (James, 2026-10-18: "not clear there's
      // other pages … you don't see a glimpse of them"). The row's gap is read
      // from the row itself (it is narrower on a small screen).
      const gap = contentRef.current ? parseFloat(getComputedStyle(contentRef.current).columnGap) || 0 : 0
      const rowW = usePdfStore.getState().numPages > 1 ? el.clientWidth - 2 * (gap + ROW_PEEK_PX) : availableW
      const heightFit = (availableH - HORIZONTAL_SCROLLBAR_ALLOWANCE) / pageHeight
      const fit = rowW > 0 ? Math.min(heightFit, Math.min(availableW, rowW) / pageWidth) : heightFit
      return Math.max(MIN_ZOOM, Math.min(1, fit))
    }
    if (availableW > 0 && availableH > 0) {
      const widthFit = Math.max(MIN_ZOOM, Math.min(1, availableW / pageWidth))
      const heightFit = Math.max(FIT_HEIGHT_MIN_ZOOM, Math.min(1, availableH / pageHeight))
      return Math.min(widthFit, heightFit)
    }
    return null
  }

  // On initial load, pick a zoom that shows the whole first page:
  // • fit-to-height so a full page is visible without scrolling, floored at
  //   FIT_HEIGHT_MIN_ZOOM (75%) so text never starts unreadably small;
  // • still capped by fit-to-width when the page is wider than the scroll
  //   container (typical on mobile) — that cap keeps the original MIN_ZOOM
  //   floor so narrow phone screens can shrink below 75%.
  // Caps at 1 so desktop zoom is never increased.
  // Every path out of here marks the document fitted, including the ones that
  // never set a zoom: `fittedDoc` is what mounts the pages, so failing to set
  // it would leave the reader on an empty viewer rather than on a badly-fitted
  // one.
  useEffect(() => {
    if (!doc) return
    // A tab coming back to the front opens where it was left, not re-fitted to
    // page 1. See lib/viewMemory.ts.
    const remembered = takeRestoredView(doc)
    if (remembered) {
      setZoom(remembered.zoom)
      scrollToRestore.current = { doc, top: remembered.top, left: remembered.left }
      setFittedDoc(doc)
      return
    }
    const el = scrollRef.current
    if (!el) { setFittedDoc(doc); return }
    let cancelled = false
    // ⚠️ A HOLD, NOT A GATE — same rule as the store's `firstPaint`. A page 1
    // that never resolves gets today's behaviour a beat later, never a viewer
    // stuck with nothing in it.
    const fallback = setTimeout(() => setFittedDoc(doc), FIT_TIMEOUT_MS)
    doc.getPage(1).then((page) => {
      if (cancelled) return
      const fit = fitZoomFor(page, el, horizontalRef.current)
      if (fit !== null) setZoom(fit)
      setFittedDoc(doc)
    }).catch(() => { if (!cancelled) setFittedDoc(doc) })
    return () => { cancelled = true; clearTimeout(fallback) }
  }, [doc])

  // Tell the tab store where the reader is, for when this document goes to a
  // background tab. Read on demand, so it costs nothing while nobody asks.
  useEffect(
    () =>
      registerViewProvider(() => {
        const el = scrollRef.current
        return el ? { zoom: zoomRef.current, top: el.scrollTop, left: el.scrollLeft } : null
      }),
    []
  )

  // Put a returning tab's scroll back. Its pages take their heights as pdf.js
  // hands them over, so the box may not be tall enough on the first frame —
  // try each frame until it is, and give up after about a second rather than
  // yank the reader somewhere later.
  useEffect(() => {
    const target = scrollToRestore.current
    const el = scrollRef.current
    if (!fitted || !target || target.doc !== doc || !el) return
    scrollToRestore.current = null
    let frame = 0
    let tries = 0
    const apply = () => {
      frame = 0
      // Both axes: with Page scrolling horizontal it is the WIDTH that grows
      // as the pages take their sizes.
      const fits =
        el.scrollHeight - el.clientHeight >= target.top - 1 &&
        el.scrollWidth - el.clientWidth >= target.left - 1
      if (fits || ++tries > 60) {
        el.scrollTop = target.top
        el.scrollLeft = target.left
        return
      }
      frame = requestAnimationFrame(apply)
    }
    apply()
    return () => {
      if (frame) cancelAnimationFrame(frame)
    }
  }, [fitted, doc])

  // Publish the rendered document width and the document scroll-container's
  // scrollbar width as CSS custom properties so the top toolbar and the
  // pages/zoom strip can line up with the document edges. The document is
  // centered inside the scroll container (which loses width to its vertical
  // scrollbar), so each bar's mx-auto wrapper applies a padding-right of
  // --doc-scrollbar-width to make the centering box match.
  useEffect(() => {
    if (!doc) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const scrollEl = scrollRef.current

    function updateScrollbar() {
      if (!scrollEl) return
      // Defer slightly so the browser finishes any reflow that adds/removes
      // the scrollbar before we read clientWidth.
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        if (!scrollEl || cancelled) return
        const sb = scrollEl.offsetWidth - scrollEl.clientWidth
        document.documentElement.style.setProperty('--doc-scrollbar-width', `${sb}px`)
      }, 0)
    }

    updateScrollbar()
    const ro = scrollEl ? new ResizeObserver(updateScrollbar) : null
    if (scrollEl && ro) {
      ro.observe(scrollEl)
      const inner = scrollEl.firstElementChild
      if (inner) ro.observe(inner)
    }

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      ro?.disconnect()
      document.documentElement.style.removeProperty('--doc-scrollbar-width')
    }
  }, [doc, scale])

  // `--doc-display-width` (page 1's width) is published by `notifySized` as
  // page 1 takes each new size; it goes only when the viewer does.
  useEffect(() => () => {
    displayWidthRef.current = ''
    document.documentElement.style.removeProperty('--doc-display-width')
  }, [])

  // Ctrl/Cmd+F opens the find bar (and re-focuses it if already open),
  // overriding the browser's own find. Find reads the text layer, which XFA
  // forms don't have, so it's disabled there.
  useEffect(() => {
    if (isXfa) return
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isXfa, setSearchOpen])

  // Drop any find state when the document changes or unmounts.
  useEffect(() => resetSearch, [doc, resetSearch])

  if (!doc) return null

  const handCursor = tool === 'hand' ? 'grab' : undefined
  const zoomDisabled = !['select', 'hand', 'form', 'marquee', 'selecttext'].includes(tool)
  const atHundred = Math.round(zoom * 100) === 100
  // Float tolerance: the + button walks in 10% steps and rounds, so the step
  // that lands on the ceiling can land a fraction of a percent under it.
  const atMaxZoom = zoom >= maxZoom - 0.001
  const zoomInDisabled = zoomDisabled || atMaxZoom

  return (
    <div className="flex flex-col h-full">
      {/* Page / zoom / Present bar — pinned to the BOTTOM via order-last (the
          flex column otherwise keeps it in source order at the top). */}
      <div className="hidden md:block bg-slate-100 border-t border-slate-200 order-last">
        <div style={{ paddingRight: 'var(--doc-scrollbar-width, 0px)' }}>
        <div
          className="mx-auto w-full grid grid-cols-[auto_1fr_auto] items-center gap-2 py-1.5 text-sm text-slate-600"
          style={{ maxWidth: 'clamp(600px, var(--doc-display-width, 80rem), 80rem)' }}
        >
          <div className="flex items-center">
            {numPages > 1 ? (
              <button
                onClick={togglePageNav}
                title={t('viewer.bar.show_pages')}
                // Universal PDF's cobalt (2026-10-12): outlined on pale blue,
                // solid while the panel is open.
                className={`flex items-center gap-1.5 px-2.5 h-8 rounded-lg border-[1.5px] border-cobalt text-sm font-bold transition-colors ${
                  pageNavOpen
                    ? 'bg-cobalt text-white hover:bg-cobalt-deep'
                    : 'bg-cobalt-tint text-cobalt-deep hover:bg-[#e2e9fb]'
                }`}
              >
                <span aria-hidden="true">☰</span>
                <span>{t('viewer.bar.pages')}</span>
                <span className="opacity-70 tabular-nums">{numPages}</span>
              </button>
            ) : (
              <span className="px-1">{t.plural('viewer.bar.page_count', numPages)}</span>
            )}
          </div>
          <div className="flex justify-center min-w-0">
            <FileNameEditor />
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => setPresentOpen(true)}
              title={t('viewer.bar.present_title')}
              className="px-2.5 h-7 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium flex items-center gap-1.5"
            >
              <span aria-hidden="true">▶</span>
              {t('viewer.bar.present')}
            </button>
            <span className="w-px h-5 bg-slate-200" aria-hidden="true" />
            <button
              onClick={zoomStepOut}
              disabled={zoomDisabled}
              className={`w-7 h-7 rounded border ${zoomDisabled ? 'border-slate-200 text-slate-300 cursor-not-allowed bg-white' : 'bg-white border-slate-300 hover:bg-slate-50'}`}
              aria-label={t('viewer.bar.zoom_out')}
            >
              −
            </button>
            <div className="relative" ref={zoomMenuRef}>
              <button
                onClick={() => { if (atHundred) setZoomMenuOpen((o) => !o); else zoomReset() }}
                disabled={zoomDisabled}
                title={atHundred ? t('viewer.bar.zoom_presets') : t('viewer.bar.zoom_reset')}
                aria-haspopup={atHundred ? 'menu' : undefined}
                aria-expanded={atHundred ? zoomMenuOpen : undefined}
                className={`w-14 text-center tabular-nums rounded border border-transparent ${zoomDisabled ? 'text-slate-300 cursor-not-allowed' : 'hover:bg-white hover:border-slate-300'}`}
              >
                {Math.round(zoom * 100)}%
              </button>
              {zoomMenuOpen && atHundred && (
                <div role="menu" className="absolute bottom-full right-0 mb-1 w-20 bg-white border border-slate-200 rounded-lg shadow-xl py-1 z-50">
                  {ZOOM_PRESETS.map((p) => (
                    <button
                      key={p}
                      role="menuitem"
                      onClick={() => { zoomAboutCentre(p / 100); setZoomMenuOpen(false) }}
                      className="w-full text-center tabular-nums px-3 py-1.5 text-sm text-slate-700 hover:bg-orange-50 hover:text-orange-700"
                    >
                      {p}%
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={zoomStepIn}
              disabled={zoomInDisabled}
              title={atMaxZoom ? t('viewer.bar.zoom_max', { percent: Math.round(maxZoom * 100) }) : t('viewer.bar.zoom_in')}
              className={`w-7 h-7 rounded border ${zoomInDisabled ? 'border-slate-200 text-slate-300 cursor-not-allowed bg-white' : 'bg-white border-slate-300 hover:bg-slate-50'}`}
              aria-label={t('viewer.bar.zoom_in')}
            >
              +
            </button>
          </div>
        </div>
        </div>
      </div>
      {isXfa && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 text-center">
          {t('viewer.bar.xfa_notice')}
        </div>
      )}
      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          className="absolute inset-0 overflow-auto bg-slate-200 flex flex-col"
          style={{ cursor: handCursor }}
        >
          {/* ⚠️ CENTRED WITH AUTO MARGINS, NOT `justify-center`. A document
              shorter than the viewport — one page on a phone, or anything
              zoomed out — used to sit against the top with the rest of the
              screen empty below it. Auto margins are the only centring that is
              safe inside a scroll container: they absorb free space only while
              it is positive, so the moment the pages are taller than the
              viewport they resolve to 0 and the document goes back to starting
              at the top, fully scrollable. `justify-content: center` would
              instead split the overflow above and below and put the top of page
              1 somewhere no scroll position can reach.
              `shrink-0` keeps a tall document at its own height rather than
              letting the flex column compress it. */}
          {/* Horizontal Page scrolling lays the pages out in a row, centred
              both ways with the same auto margins: `w-max` keeps the row at
              its own width so `mx-auto` can centre one that is narrower than
              the window and resolve to 0 the moment it is wider.
              ⚠️ And padded by half the window less half a page at each end,
              so page 1 OPENS IN THE MIDDLE of the screen and the last page can
              be scrolled to the middle too (James, 2026-10-07: "page 1 should
              start in the center of the screen (not on the left)"). The
              percentage resolves against the scroll box's width; the page
              width is page 1's, published as --doc-display-width below, and
              until that lands the floor is the vertical layout's 16px. */}
          <div
            ref={contentRef}
            className={`flex items-center py-6 shrink-0 my-auto ${horizontal ? 'flex-row w-max mx-auto gap-3 sm:gap-6' : 'flex-col px-4 gap-6'}`}
            style={horizontal ? { paddingInline: `max(${ROW_END_MIN_PAD}px, calc(50% - var(--doc-display-width, 0px) / 2))` } : undefined}
          >
            {fitted && Array.from({ length: numPages }, (_, i) => (
              <PdfPage
                key={i}
                doc={doc}
                pageIndex={i}
                scale={scale}
                isXfa={isXfa}
                active={i >= active.from && i <= active.to}
                onSized={notifySized}
              />
            ))}
          </div>
        </div>
        {searchOpen && <FindBar />}
      </div>
    </div>
  )
}
