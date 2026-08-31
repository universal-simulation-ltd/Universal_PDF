import { useCallback, useEffect, useRef, useState } from 'react'
import { usePdfStore } from '../../stores/pdfStore'
import { useAnnotationStore } from '../../stores/annotationStore'
import { useSearchStore } from '../../stores/searchStore'
import FileNameEditor from '../Header/FileNameEditor'
import FindBar from './FindBar'
import PdfPage from './PdfPage'
import { maxZoomForDocument } from '../../lib/renderBudget'
import { setAnchorPage } from '../../lib/renderQueue'

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
// Quick presets offered when you click the % label while at 100%.
const ZOOM_PRESETS = [50, 75, 125, 150]
// How long a zoom waits for the pages to re-lay-out before restoring the
// anchored scroll position anyway. Long enough for a page to re-rasterize on a
// slow phone, short enough that a zoom which doesn't move the layout box (or a
// page that fails to render) can't leave a pinch's transform stuck on screen.
const LAYOUT_SETTLE_MS = 400

export default function PdfViewer() {
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
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false)
  const zoomMenuRef = useRef<HTMLDivElement>(null)

  // Keep a ref to the current zoom so the long-lived touch handlers below
  // can read it without re-binding on every change.
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  // How far this document can be zoomed on this device before the pages stop
  // fitting in memory. Pages are all rasterized at once, so it falls as the
  // document gets longer; it is measured off page 1 and re-measured whenever
  // pages are added or removed.
  const [maxZoom, setMaxZoom] = useState(MAX_ZOOM)
  const maxZoomRef = useRef(maxZoom)
  maxZoomRef.current = maxZoom

  useEffect(() => {
    if (!doc) return
    let cancelled = false
    doc.getPage(1).then((page) => {
      if (cancelled) return
      const { width, height } = page.getViewport({ scale: BASE_SCALE })
      setMaxZoom(maxZoomForDocument(width, height, numPages, MAX_ZOOM))
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
  const MAX_ACTIVE_RADIUS = 12

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
      const mid = box.top + box.height / 2
      // One screen of margin either side: a page enters the band before it can
      // be scrolled into view, so its layers are never seen arriving.
      const margin = box.height
      let best = 0
      let bestDist = Infinity
      let first = Infinity
      let last = -Infinity
      for (const p of el!.querySelectorAll<HTMLElement>('[data-page-index]')) {
        const r = p.getBoundingClientRect()
        const i = Number(p.dataset.pageIndex)
        const d = Math.abs(r.top + r.height / 2 - mid)
        if (d < bestDist) {
          bestDist = d
          best = i
        }
        if (r.bottom > box.top - margin && r.top < box.bottom + margin) {
          if (i < first) first = i
          if (i > last) last = i
        }
      }
      setAnchorPage(best)
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
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [doc])

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

  function restoreAnchor(el: HTMLDivElement, a: ZoomAnchor) {
    const page = el.querySelector<HTMLElement>(`[data-page-index="${a.pageIndex}"]`)
    if (!page) return
    const box = el.getBoundingClientRect()
    const r = page.getBoundingClientRect()
    el.scrollLeft += r.left + a.fx * r.width - box.left - a.screenX
    el.scrollTop += r.top + a.fy * r.height - box.top - a.screenY
  }

  // Pages report a new box size here, from a LAYOUT effect — synchronously
  // after React writes it and before the browser paints. A settling zoom
  // listens; see `commitZoom`.
  const sizeListeners = useRef(new Set<() => void>())
  const notifySized = useCallback(() => {
    // Copy first: a listener that finishes removes itself mid-iteration.
    for (const fn of [...sizeListeners.current]) fn()
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
      content!.style.transformOrigin = `${el!.scrollLeft + anchor!.screenX}px ${el!.scrollTop + anchor!.screenY}px`
      content!.style.transform = `scale(${k})`
    }

    sizeListeners.current.add(onSized)
    timer = setTimeout(finish, LAYOUT_SETTLE_MS)
    pendingZoom.current = { finish, cancel: teardown }
  }

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
    }
    let pinch: Pinch | null = null
    let frame = 0

    function dist(t1: Touch, t2: Touch) {
      return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY)
    }

    function clearTransform() {
      const content = contentRef.current
      if (!content) return
      content.style.transform = ''
      content.style.transformOrigin = ''
      content.style.willChange = ''
    }

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
      // Read back what the container would actually accept, and let the
      // translation absorb the difference: whatever the scroll ends up being,
      // the anchored point stays exactly under the fingers.
      //
      // Scaling about the anchor, with the transform origin at the content's
      // top-left: the anchored point is (scroll at the start + anchor) in
      // content coordinates, and this translation is what holds it in place.
      const anchoredX = pinch.scrollLeft + pinch.anchorX
      const anchoredY = pinch.scrollTop + pinch.anchorY
      const tx = pinch.anchorX + el.scrollLeft - pinch.ratio * anchoredX
      const ty = pinch.anchorY + el.scrollTop - pinch.ratio * anchoredY
      content.style.transform = `translate(${tx}px, ${ty}px) scale(${pinch.ratio})`
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
      pinch = {
        baseDist: dist(t1, t2),
        baseRatio: 1,
        initialZoom: zoomRef.current,
        anchorX,
        anchorY,
        // The gesture holds this point of the document under the midpoint the
        // whole way — the transform below scales about it, and the commit
        // scrolls it back under it once the pages have re-rendered.
        anchor: captureAnchor(el, anchorX, anchorY),
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
        ratio: 1
      }
      const content = contentRef.current
      if (content) {
        content.style.transformOrigin = '0 0'
        content.style.willChange = 'transform'
      }
    }

    function onMove(e: TouchEvent) {
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
      if (e.touches.length === 0) usePdfStore.getState().setPinching(false)
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
    }
    let gesture: WheelGesture | null = null
    let frame = 0
    let settle: ReturnType<typeof setTimeout> | null = null
    // How long the stream must go quiet before the zoom commits. A touchpad
    // emits ticks continuously through a pinch, so this is beyond its
    // inter-event gap — but short enough that a single ctrl+wheel notch on a
    // mouse still feels immediate.
    const SETTLE_MS = 120

    function clearTransform() {
      const content = contentRef.current
      if (!content) return
      content.style.transform = ''
      content.style.transformOrigin = ''
      content.style.willChange = ''
    }

    // Same transform arithmetic as the pinch's draw(): pin the scroll where
    // the gesture found it and hold the anchored point under the cursor.
    function draw() {
      frame = 0
      const content = contentRef.current
      if (!gesture || !el || !content) return
      if (el.scrollLeft !== gesture.scrollLeft) el.scrollLeft = gesture.scrollLeft
      if (el.scrollTop !== gesture.scrollTop) el.scrollTop = gesture.scrollTop
      const anchoredX = gesture.scrollLeft + gesture.anchorX
      const anchoredY = gesture.scrollTop + gesture.anchorY
      const tx = gesture.anchorX + el.scrollLeft - gesture.ratio * anchoredX
      const ty = gesture.anchorY + el.scrollTop - gesture.ratio * anchoredY
      content.style.transform = `translate(${tx}px, ${ty}px) scale(${gesture.ratio})`
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
      if (!el || (!e.ctrlKey && !e.metaKey)) return
      e.preventDefault()
      if (!gesture) {
        // Land a zoom still waiting on layout so this gesture measures itself
        // against the document as it really sits.
        pendingZoom.current?.finish()
        const rect = el.getBoundingClientRect()
        const anchorX = e.clientX - rect.left
        const anchorY = e.clientY - rect.top
        gesture = {
          initialZoom: zoomRef.current,
          ratio: 1,
          anchorX,
          anchorY,
          anchor: captureAnchor(el, anchorX, anchorY),
          scrollLeft: el.scrollLeft,
          scrollTop: el.scrollTop
        }
        const content = contentRef.current
        if (content) {
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

  // On initial load, pick a zoom that shows the whole first page:
  // • fit-to-height so a full page is visible without scrolling, floored at
  //   FIT_HEIGHT_MIN_ZOOM (75%) so text never starts unreadably small;
  // • still capped by fit-to-width when the page is wider than the scroll
  //   container (typical on mobile) — that cap keeps the original MIN_ZOOM
  //   floor so narrow phone screens can shrink below 75%.
  // Caps at 1 so desktop zoom is never increased.
  useEffect(() => {
    if (!doc) return
    const el = scrollRef.current
    if (!el) return
    let cancelled = false
    doc.getPage(1).then((page) => {
      if (cancelled) return
      const { width: pageWidth, height: pageHeight } = page.getViewport({ scale: BASE_SCALE })
      const availableW = el.clientWidth - 32 // px-4 padding × 2
      const availableH = el.clientHeight - 48 // py-6 padding × 2
      if (availableW <= 0 || availableH <= 0) return
      const widthFit = Math.max(MIN_ZOOM, Math.min(1, availableW / pageWidth))
      const heightFit = Math.max(FIT_HEIGHT_MIN_ZOOM, Math.min(1, availableH / pageHeight))
      setZoom(Math.min(widthFit, heightFit))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [doc])

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

    doc.getPage(1).then((page) => {
      if (cancelled) return
      const { width } = page.getViewport({ scale })
      document.documentElement.style.setProperty('--doc-display-width', `${width}px`)
      updateScrollbar()
    }).catch(() => {})

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
      document.documentElement.style.removeProperty('--doc-display-width')
      document.documentElement.style.removeProperty('--doc-scrollbar-width')
    }
  }, [doc, scale])

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
                title="Show pages"
                className={`flex items-center gap-1.5 px-2.5 h-8 rounded text-sm font-medium transition-colors ${
                  pageNavOpen
                    ? 'bg-orange-700 text-white hover:bg-orange-800'
                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span aria-hidden="true">☰</span>
                <span>Pages</span>
                <span className="opacity-70 tabular-nums">{numPages}</span>
              </button>
            ) : (
              <span className="px-1">{numPages} page</span>
            )}
          </div>
          <div className="flex justify-center min-w-0">
            <FileNameEditor />
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => setPresentOpen(true)}
              title="Present full screen (F)"
              className="px-2.5 h-7 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium flex items-center gap-1.5"
            >
              <span aria-hidden="true">▶</span>
              Present
            </button>
            <span className="w-px h-5 bg-slate-200" aria-hidden="true" />
            <button
              onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)))}
              disabled={zoomDisabled}
              className={`w-7 h-7 rounded border ${zoomDisabled ? 'border-slate-200 text-slate-300 cursor-not-allowed bg-white' : 'bg-white border-slate-300 hover:bg-slate-50'}`}
              aria-label="Zoom out"
            >
              −
            </button>
            <div className="relative" ref={zoomMenuRef}>
              <button
                onClick={() => { if (atHundred) setZoomMenuOpen((o) => !o); else setZoom(1) }}
                disabled={zoomDisabled}
                title={atHundred ? 'Zoom presets' : 'Reset to 100% (actual size)'}
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
                      onClick={() => { setZoom(Math.max(MIN_ZOOM, Math.min(maxZoom, p / 100))); setZoomMenuOpen(false) }}
                      className="w-full text-center tabular-nums px-3 py-1.5 text-sm text-slate-700 hover:bg-orange-50 hover:text-orange-700"
                    >
                      {p}%
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setZoom((z) => Math.min(maxZoom, +(z + ZOOM_STEP).toFixed(2)))}
              disabled={zoomInDisabled}
              title={atMaxZoom ? `Maximum zoom for this document (${Math.round(maxZoom * 100)}%)` : 'Zoom in'}
              className={`w-7 h-7 rounded border ${zoomInDisabled ? 'border-slate-200 text-slate-300 cursor-not-allowed bg-white' : 'bg-white border-slate-300 hover:bg-slate-50'}`}
              aria-label="Zoom in"
            >
              +
            </button>
          </div>
        </div>
        </div>
      </div>
      {isXfa && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 text-center">
          This is an Adobe XFA form. You can view and fill it; downloading saves your
          entries. Annotation and redaction tools don't apply, and complex dynamic
          forms may render only partially.
        </div>
      )}
      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          className="absolute inset-0 overflow-auto bg-slate-200"
          style={{ cursor: handCursor }}
        >
          <div ref={contentRef} className="flex flex-col items-center gap-6 py-6 px-4">
            {Array.from({ length: numPages }, (_, i) => (
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
