import { useCallback, useEffect, useRef, useState } from 'react'
import { usePdfStore } from '../../stores/pdfStore'
import { useAnnotationStore } from '../../stores/annotationStore'
import { buildAnnotatedPdfBytes } from '../../lib/export'
import { pdfjsLib, type PDFDocumentProxy } from '../../lib/pdfjs'

// 1:1 with the editor's PDF-point coordinate space — see ExportModal.tsx.
const EXPORT_SCALE = 1.0
// Hide the chrome (top bar, arrows) after this long with no pointer/key input,
// so the slide fills the screen distraction-free during a talk.
const IDLE_HIDE_MS = 2500

export default function PresentMode() {
  const open = usePdfStore((s) => s.presentOpen)
  const setOpen = usePdfStore((s) => s.setPresentOpen)
  const sourceBytes = usePdfStore((s) => s.sourceBytes)

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const [controlsVisible, setControlsVisible] = useState(true)

  const rootRef = useRef<HTMLDivElement>(null)
  const buildIdRef = useRef(0)
  const idleTimer = useRef<number | null>(null)

  const numPages = doc?.numPages ?? 0

  // Build the annotated PDF once on open (same pipeline as Preview/Export) so
  // the presented slides match exactly what the user would download.
  useEffect(() => {
    if (!open || !sourceBytes) return
    const myId = ++buildIdRef.current
    setBuilding(true)
    setError(null)
    setPageIndex(0)

    ;(async () => {
      try {
        const annotations = useAnnotationStore.getState().annotations
        const copy = sourceBytes.slice(0)
        const out = await buildAnnotatedPdfBytes(copy, annotations, EXPORT_SCALE)
        if (myId !== buildIdRef.current) return
        const renderCopy = out.slice().buffer
        const nextDoc = await pdfjsLib.getDocument({ data: renderCopy }).promise
        if (myId !== buildIdRef.current) {
          nextDoc.destroy()
          return
        }
        setDoc((prev) => {
          prev?.destroy()
          return nextDoc
        })
      } catch (e) {
        if (myId !== buildIdRef.current) return
        console.error(e)
        setError((e as Error).message || 'Could not start presentation')
      } finally {
        if (myId === buildIdRef.current) setBuilding(false)
      }
    })()
  }, [open, sourceBytes])

  // Tear down the rendered doc when the overlay closes so we don't hold memory.
  useEffect(() => {
    if (open) return
    setDoc((prev) => {
      prev?.destroy()
      return null
    })
    setError(null)
    buildIdRef.current++
  }, [open])

  const close = useCallback(() => setOpen(false), [setOpen])
  const next = useCallback(() => {
    setPageIndex((i) => (doc ? Math.min(doc.numPages - 1, i + 1) : i))
  }, [doc])
  const prev = useCallback(() => {
    setPageIndex((i) => Math.max(0, i - 1))
  }, [])

  // Tap the left third of the slide to go back, the rest to advance. The
  // back zone is kept narrow so it isn't hit by accident when clicking through.
  const onStageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      if (x < rect.width / 3) prev()
      else next()
    },
    [prev, next]
  )

  // Enter native fullscreen on open (best-effort — unsupported on iOS Safari,
  // where the fixed overlay alone already fills the screen). Leave fullscreen
  // when the overlay closes, and close the overlay if the user exits fullscreen
  // by other means (the native Esc / F11).
  useEffect(() => {
    if (!open) return
    const el = rootRef.current
    el?.requestFullscreen?.().catch(() => {})

    function onFsChange() {
      if (open && !document.fullscreenElement) setOpen(false)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    }
  }, [open, setOpen])

  // Keyboard navigation.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      switch (e.key) {
        case 'Escape':
          // When in fullscreen the browser handles Esc (exit fullscreen), which
          // fires fullscreenchange and closes us. Only close directly otherwise.
          if (!document.fullscreenElement) {
            e.preventDefault()
            close()
          }
          break
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
        case ' ':
          e.preventDefault()
          next()
          break
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault()
          prev()
          break
        case 'Home':
          e.preventDefault()
          setPageIndex(0)
          break
        case 'End':
          e.preventDefault()
          if (doc) setPageIndex(doc.numPages - 1)
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, doc, close, next, prev])

  // Auto-hide the chrome after a spell of inactivity; any pointer/key activity
  // brings it back.
  useEffect(() => {
    if (!open) return
    function poke() {
      setControlsVisible(true)
      if (idleTimer.current !== null) clearTimeout(idleTimer.current)
      idleTimer.current = window.setTimeout(() => setControlsVisible(false), IDLE_HIDE_MS)
    }
    poke()
    window.addEventListener('pointermove', poke)
    window.addEventListener('keydown', poke)
    return () => {
      window.removeEventListener('pointermove', poke)
      window.removeEventListener('keydown', poke)
      if (idleTimer.current !== null) clearTimeout(idleTimer.current)
    }
  }, [open])

  if (!open) return null

  return (
    // Same trap as LivePreview: a `fixed inset-0` overlay is positioned against
    // the viewport, outside the safe-area padding App.tsx puts on the app root,
    // so Exit would sit under the Dynamic Island with no way out of
    // presentation mode. All the insets are 0 in a browser.
    <div
      ref={rootRef}
      className="fixed inset-0 z-[70] bg-black flex flex-col select-none"
      style={{
        cursor: controlsVisible ? 'default' : 'none',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {/* Top chrome — page counter + exit. */}
      <div
        className={`absolute top-0 left-0 right-0 z-10 flex items-center gap-3 px-4 py-2 text-white bg-gradient-to-b from-black/60 to-transparent transition-opacity duration-300 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top))' }}
      >
        <span className="text-sm tabular-nums text-white/80">
          {numPages > 0 ? `${pageIndex + 1} / ${numPages}` : ''}
        </span>
        <button
          onClick={close}
          className="ml-auto px-3 h-9 rounded bg-white/15 hover:bg-white/25 text-sm font-medium backdrop-blur-sm"
          aria-label="Exit presentation"
        >
          {/* ⚠️ An SVG, not `✕` — U+2715 has no glyph in iOS's system font and
              WebKit does not fall back, so the one way out of presentation
              mode read "Exit ▯?▯" on the phone. See the suite landmines. */}
          <span className="inline-flex items-center gap-1.5">
            Exit
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
              <path d="m4 4 8 8M12 4l-8 8" />
            </svg>
          </span>
        </button>
      </div>

      {/* Slide stage — tap the left third to go back, elsewhere to advance. */}
      <div
        onClick={onStageClick}
        className="flex-1 min-h-0 flex items-center justify-center overflow-hidden"
      >
        {error ? (
          <div className="text-red-400 px-6 text-center">Presentation failed: {error}</div>
        ) : !doc ? (
          <div className="text-white/60">{building ? 'Preparing slides…' : 'Loading…'}</div>
        ) : (
          <Slide doc={doc} pageIndex={pageIndex} />
        )}
      </div>

      {/* Prev / Next arrows. */}
      <button
        onClick={(e) => { e.stopPropagation(); prev() }}
        disabled={pageIndex === 0}
        aria-label="Previous page"
        className={`absolute left-3 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/10 hover:bg-white/25 text-white text-2xl flex items-center justify-center backdrop-blur-sm transition-opacity duration-300 disabled:opacity-0 disabled:pointer-events-none ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        ‹
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); next() }}
        disabled={numPages > 0 && pageIndex >= numPages - 1}
        aria-label="Next page"
        className={`absolute right-3 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/10 hover:bg-white/25 text-white text-2xl flex items-center justify-center backdrop-blur-sm transition-opacity duration-300 disabled:opacity-0 disabled:pointer-events-none ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        ›
      </button>
    </div>
  )
}

function Slide({
  doc,
  pageIndex
}: {
  doc: PDFDocumentProxy
  pageIndex: number
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  // Measure the slide's own wrapper (which fills the stage) rather than the
  // window: this reflects the actual rendered size and fires once layout is
  // available, so the slide paints even if the overlay mounts before the
  // browser has settled on a size.
  const [area, setArea] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    let raf = 0
    let settled = false
    function measure() {
      if (!el) return
      const width = el.clientWidth
      const height = el.clientHeight
      // Ignore transient/uninitialised zero sizes — keep the last good area so a
      // momentary 0 (tab hidden, mid-layout) never blanks the slide. Only update
      // on a real size change so an identical-size ResizeObserver tick doesn't
      // churn the render effect's `area` dependency and cancel the live render.
      if (width === 0 || height === 0) return
      settled = true
      setArea((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }))
    }
    // Poll on animation frames until the first real size lands (covers an
    // overlay that mounts before the browser has settled on a size), then let
    // ResizeObserver track later resizes.
    function poll() {
      measure()
      if (!settled) raf = requestAnimationFrame(poll)
    }
    poll()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!area || area.width === 0 || area.height === 0) return
    let cancelled = false
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null

    async function render() {
      const page = await doc.getPage(pageIndex + 1)
      if (cancelled) return
      const base = page.getViewport({ scale: 1 })
      // Fit the page entirely within the stage, leaving a small margin.
      const margin = 0.94
      const fit = Math.min((area!.width * margin) / base.width, (area!.height * margin) / base.height)

      const cssViewport = page.getViewport({ scale: fit })
      const rawDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
      const MAX_CANVAS_PIXELS = 16_000_000
      const dpr = Math.min(
        rawDpr,
        2,
        Math.sqrt(MAX_CANVAS_PIXELS / (cssViewport.width * cssViewport.height))
      )
      const renderViewport = page.getViewport({ scale: fit * dpr })

      // Render off-screen first, then blit, so the previous slide stays on
      // screen until the next is ready (no white flash on the black backdrop).
      const off = document.createElement('canvas')
      off.width = renderViewport.width
      off.height = renderViewport.height
      const offCtx = off.getContext('2d')
      if (!offCtx) return
      renderTask = page.render({ canvasContext: offCtx, viewport: renderViewport })
      try {
        await renderTask.promise
      } catch {
        return // cancelled
      }
      if (cancelled) return

      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width = renderViewport.width
      canvas.height = renderViewport.height
      canvas.style.width = `${cssViewport.width}px`
      canvas.style.height = `${cssViewport.height}px`
      ctx.drawImage(off, 0, 0)
      setSize({ width: cssViewport.width, height: cssViewport.height })
    }

    render()
    return () => {
      cancelled = true
      renderTask?.cancel()
    }
  }, [doc, pageIndex, area])

  return (
    <div ref={wrapRef} className="w-full h-full flex items-center justify-center">
      <canvas
        ref={canvasRef}
        className="block shadow-2xl bg-white"
        style={size ? { width: size.width, height: size.height } : undefined}
      />
    </div>
  )
}
