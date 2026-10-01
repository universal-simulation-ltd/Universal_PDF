import { useEffect, useReducer, useRef, type RefObject } from 'react'
import type { PDFDocumentProxy } from '../lib/pdfjs'
import { requestRenderSlot, type RenderSlot } from '../lib/renderQueue'
import { holdPage } from '../components/Viewer/pageRetention'
import { usePdfStore } from '../stores/pdfStore'

// ── Thumbnails are sized to the pixels they actually occupy ─────────────
// The pane renders each page into an <img> capped at 180 CSS px wide (see
// PageThumb). A fixed pdf.js scale can't know that: 0.22 gave A4 ~131px, so
// the browser stretched it to 180 and the device stretched THAT again on a
// HiDPI screen — a ~2.7x upscale of a low-quality JPEG. Render at the CSS
// width times the device pixel ratio instead, and the image is 1:1 with the
// physical pixels. Capped at 2x: beyond that the file grows faster than
// anyone can see.
const THUMB_CSS_WIDTH = 180
const THUMB_MAX_DPR = 2
const THUMB_QUALITY = 0.85

// How many thumbnails are kept at once. Each is a JPEG data URL of roughly
// 30–80 KB at the size above, so this is a few MB however long the document.
// Comfortably more than a pane's worth (four or five on a desktop, two or three
// in the phone sheet) plus the look-ahead below, so scrolling back a little
// never has to redraw.
const THUMB_CACHE_MAX = 48

// How far beyond the pane's visible edge a thumbnail counts as "near" and is
// drawn ahead of being scrolled to — about two thumbnails either way.
const LOOK_AHEAD = '600px 0px'

/**
 * Thumbnails for the page navigator, drawn only while it is open and only for
 * the pages near where it is scrolled to.
 *
 * ⚠️ What this replaced, because each half of it was a cost paid by everyone
 * who never opened the pane. The navigator is always mounted, and on every
 * document open it rasterized EVERY page to a JPEG — straight through pdf.js,
 * outside `renderQueue`, so on a long document those renders competed with
 * page 1 of the viewer for the worker — and copied the whole array of data URLs
 * once per page (`setThumbs([...acc])`), which is quadratic in the page count.
 * A 500-page document then held 500 data URLs for the life of the tab.
 *
 * Now: nothing happens until the pane is open AND the viewer has painted
 * (`firstPaint`), one thumbnail draws at a time and asks `renderQueue` for its
 * turn like any viewer page, and at most `THUMB_CACHE_MAX` are kept — the
 * longest-unseen go first, never one that is on screen.
 *
 * Elements to watch are found under `rootRef` by their `data-thumb-page`
 * attribute (the page's index in the document as it stands), so a staged
 * reorder that only moves the elements needs no re-observing.
 *
 * Returns a lookup from page index to its data URL; the component re-renders
 * whenever a new one lands.
 */
export function usePageThumbnails(
  doc: PDFDocumentProxy | null,
  numPages: number,
  open: boolean,
  rootRef: RefObject<HTMLElement | null>
): (pageIndex: number) => string | undefined {
  // Insertion order IS recency: a thumbnail seen again is deleted and re-added,
  // so the first entry is always the longest-unseen.
  const cache = useRef(new Map<number, string>())
  const visible = useRef(new Set<number>())
  const [, bump] = useReducer((n: number) => n + 1, 0)
  // Wakes the drawing loop of the current effect run (when there is one).
  const wake = useRef<() => void>(() => {})
  const firstPaint = usePdfStore((s) => s.firstPaint)

  // A new document (a delete or reorder swaps the PDFDocumentProxy) makes every
  // thumbnail stale — drop them all, open or not, so a reopened pane never
  // shows old images in their previous slots.
  useEffect(() => {
    cache.current.clear()
    visible.current.clear()
    bump()
  }, [doc, numPages])

  // Which thumbnails are on (or near) screen.
  useEffect(() => {
    const root = rootRef.current
    if (!open || !doc || !root) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const i = Number((entry.target as HTMLElement).dataset.thumbPage)
          if (!Number.isFinite(i)) continue
          if (entry.isIntersecting) {
            visible.current.add(i)
            // Seen again — make it the most recent so it is the last evicted.
            const url = cache.current.get(i)
            if (url !== undefined) {
              cache.current.delete(i)
              cache.current.set(i, url)
            }
          } else {
            visible.current.delete(i)
          }
        }
        wake.current()
      },
      { root, rootMargin: LOOK_AHEAD }
    )
    for (const el of root.querySelectorAll<HTMLElement>('[data-thumb-page]')) io.observe(el)
    return () => {
      io.disconnect()
      visible.current.clear()
    }
  }, [open, doc, numPages, rootRef])

  // The drawing loop: one thumbnail at a time, nearest the top of the pane
  // first, for as long as there is a visible page without one.
  useEffect(() => {
    // ⚠️ `firstPaint` gates the whole loop. A pane left open from the last
    // document would otherwise start drawing thumbnails the instant the new
    // one loads — before the viewer's page 1, which is what the reader is
    // actually waiting for.
    if (!open || !doc || !firstPaint) return
    let cancelled = false
    let running = false
    let slot: RenderSlot | null = null
    let task: { cancel: () => void } | null = null

    function next(): number | null {
      let best: number | null = null
      for (const i of visible.current) {
        if (i >= numPages || cache.current.has(i)) continue
        if (best === null || i < best) best = i
      }
      return best
    }

    function evict() {
      for (const i of cache.current.keys()) {
        if (cache.current.size <= THUMB_CACHE_MAX) return
        if (visible.current.has(i)) continue
        cache.current.delete(i)
      }
    }

    async function draw(i: number) {
      const page = await doc!.getPage(i + 1)
      if (cancelled) return
      // Held across the render so the viewer's own release can't free the page
      // under us, and released after so a page only the pane wanted is freed.
      const release = holdPage(page)
      const canvas = document.createElement('canvas')
      try {
        slot = requestRenderSlot(i)
        const go = await slot.granted
        if (!go || cancelled) return
        const dpr = Math.min(window.devicePixelRatio || 1, THUMB_MAX_DPR)
        const unscaled = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: (THUMB_CSS_WIDTH * dpr) / unscaled.width })
        canvas.width = Math.round(viewport.width)
        canvas.height = Math.round(viewport.height)
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        // JPEG has no alpha, and an untouched canvas is transparent — a PDF
        // that draws no background of its own would come out black.
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        const rt = page.render({ canvasContext: ctx, viewport })
        task = rt
        await rt.promise
        task = null
        if (cancelled) return
        cache.current.set(i, canvas.toDataURL('image/jpeg', THUMB_QUALITY))
        evict()
        bump()
      } finally {
        // Same reasons as the viewer's offscreen canvas: give the bitmap back
        // now rather than whenever the collector runs, and hand the slot on.
        canvas.width = 0
        canvas.height = 0
        slot?.release()
        slot = null
        release()
      }
    }

    async function loop() {
      if (running) return
      running = true
      try {
        for (let i = next(); i !== null && !cancelled; i = next()) {
          try {
            await draw(i)
          } catch {
            // A page that fails to draw keeps its placeholder; mark it so the
            // loop moves on rather than retrying it for ever.
            if (!cancelled) cache.current.set(i, '')
          }
        }
      } finally {
        running = false
      }
    }

    wake.current = () => void loop()
    void loop()
    return () => {
      cancelled = true
      wake.current = () => {}
      task?.cancel()
      // Leave the queue (or give the slot back) straight away: a granted
      // promise still pending would otherwise hold a place until it resolved.
      slot?.release()
      slot = null
    }
  }, [open, doc, numPages, firstPaint])

  return (pageIndex) => cache.current.get(pageIndex)
}
