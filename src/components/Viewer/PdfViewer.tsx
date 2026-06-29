import { useEffect, useRef, useState } from 'react'
import { usePdfStore } from '../../stores/pdfStore'
import { useAnnotationStore } from '../../stores/annotationStore'
import { useSearchStore } from '../../stores/searchStore'
import FileNameEditor from '../Header/FileNameEditor'
import FindBar from './FindBar'
import PdfPage from './PdfPage'

// "100% zoom" in standard PDF viewers means physical paper size on screen.
// CSS treats 1 inch as 96 px while a PDF point is 1/72 inch, so to render at
// real-world size we need a base scale of 96/72.
const BASE_SCALE = 96 / 72
const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
const ZOOM_STEP = 0.1
// Quick presets offered when you click the % label while at 100%.
const ZOOM_PRESETS = [50, 75, 125, 150]

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

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    interface Pinch {
      initialDist: number
      initialZoom: number
      relX: number
      relY: number
      initialScrollLeft: number
      initialScrollTop: number
    }
    let pinch: Pinch | null = null

    function dist(t1: Touch, t2: Touch) {
      return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY)
    }

    function onStart(e: TouchEvent) {
      if (e.touches.length !== 2 || !el) return
      const [t1, t2] = [e.touches[0], e.touches[1]]
      const rect = el.getBoundingClientRect()
      pinch = {
        initialDist: dist(t1, t2),
        initialZoom: zoomRef.current,
        relX: (t1.clientX + t2.clientX) / 2 - rect.left,
        relY: (t1.clientY + t2.clientY) / 2 - rect.top,
        initialScrollLeft: el.scrollLeft,
        initialScrollTop: el.scrollTop
      }
    }

    function onMove(e: TouchEvent) {
      if (!pinch || e.touches.length !== 2 || !el) return
      e.preventDefault()
      const [t1, t2] = [e.touches[0], e.touches[1]]
      const newZoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, pinch.initialZoom * (dist(t1, t2) / pinch.initialDist))
      )
      const ratio = newZoom / pinch.initialZoom
      const rect = el.getBoundingClientRect()
      const currentRelX = (t1.clientX + t2.clientX) / 2 - rect.left
      const currentRelY = (t1.clientY + t2.clientY) / 2 - rect.top

      const newScrollLeft = (pinch.initialScrollLeft + pinch.relX) * ratio - currentRelX
      const newScrollTop = (pinch.initialScrollTop + pinch.relY) * ratio - currentRelY

      setZoom(newZoom)
      requestAnimationFrame(() => {
        if (!el) return
        el.scrollLeft = newScrollLeft
        el.scrollTop = newScrollTop
      })
    }

    function onEnd() {
      pinch = null
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
    }
  }, [])

  // Ctrl/Cmd+Wheel zooms the PDF instead of the browser page
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    function onWheel(e: WheelEvent) {
      if (!el || (!e.ctrlKey && !e.metaKey)) return
      e.preventDefault()
      const zoomDelta = -e.deltaY * 0.001
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomRef.current * Math.exp(zoomDelta)))
      const ratio = newZoom / zoomRef.current
      const rect = el.getBoundingClientRect()
      const relX = e.clientX - rect.left
      const relY = e.clientY - rect.top
      setZoom(newZoom)
      requestAnimationFrame(() => {
        if (!el) return
        el.scrollLeft = (el.scrollLeft + relX) * ratio - relX
        el.scrollTop = (el.scrollTop + relY) * ratio - relY
      })
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
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
      dragging = true
      startX = e.clientX
      startY = e.clientY
      startScrollLeft = el.scrollLeft
      startScrollTop = el.scrollTop
      el.setPointerCapture(e.pointerId)
    }
    function onMove(e: PointerEvent) {
      if (!dragging || !el) return
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

  // On initial load, zoom out if the page is wider than the scroll container
  // (typical on mobile). Caps at 1 so desktop zoom is never increased.
  useEffect(() => {
    if (!doc) return
    const el = scrollRef.current
    if (!el) return
    let cancelled = false
    doc.getPage(1).then((page) => {
      if (cancelled) return
      const pageWidth = page.getViewport({ scale: BASE_SCALE }).width
      const available = el.clientWidth - 32 // px-4 padding × 2
      if (available > 0) {
        setZoom(Math.max(MIN_ZOOM, Math.min(1, available / pageWidth)))
      }
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
                    ? 'bg-orange-600 text-white hover:bg-orange-500'
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
                      onClick={() => { setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, p / 100))); setZoomMenuOpen(false) }}
                      className="w-full text-center tabular-nums px-3 py-1.5 text-sm text-slate-700 hover:bg-orange-50 hover:text-orange-700"
                    >
                      {p}%
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)))}
              disabled={zoomDisabled}
              className={`w-7 h-7 rounded border ${zoomDisabled ? 'border-slate-200 text-slate-300 cursor-not-allowed bg-white' : 'bg-white border-slate-300 hover:bg-slate-50'}`}
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
          <div className="flex flex-col items-center gap-6 py-6 px-4">
            {Array.from({ length: numPages }, (_, i) => (
              <PdfPage key={i} doc={doc} pageIndex={i} scale={scale} isXfa={isXfa} />
            ))}
          </div>
        </div>
        {searchOpen && <FindBar />}
      </div>
    </div>
  )
}
