import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, PDFPageProxy } from '../../lib/pdfjs'
import AnnotationLayer from './AnnotationLayer'
import FormFieldLayer from './FormFieldLayer'
import SearchHighlightLayer from './SearchHighlightLayer'
import TextSelectLayer from './TextSelectLayer'
import XfaPage from './XfaPage'
import { layerPixelRatio, pagePixelBudget } from '../../lib/renderBudget'

interface Props {
  doc: PDFDocumentProxy
  pageIndex: number
  scale: number
  // True for Adobe XFA forms: render the interactive XFA HTML layer instead of
  // rasterizing the page to canvas (whose only content is the "upgrade your PDF
  // viewer" placeholder Adobe bakes into the static stream).
  isXfa: boolean
  /**
   * Called when this page has just taken a new box size, from a LAYOUT effect —
   * synchronously after React writes the size to the DOM and before the browser
   * paints.
   *
   * ⚠️ That timing is the entire point, and a ResizeObserver cannot replace it.
   * The size below is set from `doc.getPage()`'s promise, which resolves at an
   * arbitrary moment in a frame — routinely after that frame's ResizeObserver
   * delivery step. The browser then paints the new layout while the zoom
   * gesture's CSS transform is still on it, and the observer only says so a
   * frame later. That one frame is the release flash: measured at **1.716×
   * too big** for a frame, which is exactly the gesture's own scale applied on
   * top of a layout that had already grown to match it.
   */
  onSized?: () => void
}

export default function PdfPage({ doc, pageIndex, scale, isXfa, onSized }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [page, setPage] = useState<PDFPageProxy | null>(null)

  useEffect(() => {
    let cancelled = false
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    async function render(attempt = 0) {
      const p = await doc.getPage(pageIndex + 1)
      if (cancelled) return
      setPage(p)
      const cssViewport = p.getViewport({ scale })

      // XFA pages render their content through XfaPage (HTML), so we only need
      // the logical size here — no canvas rasterization.
      if (isXfa) {
        setSize({ width: cssViewport.width, height: cssViewport.height })
        return
      }

      // Use the logical viewport for sizing (CSS pixels) and a separate
      // physical viewport for the canvas backing store so the bitmap stays
      // crisp on high-DPI screens.
      //
      // How far above CSS resolution that goes is the document's memory budget
      // to give — see `renderBudget`. Every page of the document is rasterized
      // at once, so a zoomed-in page spends its share of the budget on the
      // bitmap first and gives up sharpness before the zoom itself is capped.
      const effectiveDpr = layerPixelRatio(
        cssViewport.width,
        cssViewport.height,
        pagePixelBudget(doc.numPages)
      )
      const renderViewport = p.getViewport({ scale: scale * effectiveDpr })
      const canvas = canvasRef.current
      if (!canvas) return

      // Layout takes the page's new size straight away (a committed zoom waits
      // on exactly that); the old bitmap stretches into it until the new one
      // is ready.
      canvas.style.width = `${cssViewport.width}px`
      canvas.style.height = `${cssViewport.height}px`
      setSize({ width: cssViewport.width, height: cssViewport.height })

      // Rasterize into an offscreen canvas and blit only when complete. Two
      // reasons, both learned from a touchpad pinch leaving pages permanently
      // blank (2026-08-26):
      //   • the visible canvas is never cleared ahead of a render that may
      //     still be seconds away — or may fail — so the old bitmap stays up
      //     until the new one lands whole;
      //   • every render owns a fresh canvas, so back-to-back zoom commits
      //     can't trip pdf.js's same-canvas guard while the previous task's
      //     cancellation is still settling.
      const off = document.createElement('canvas')
      off.width = renderViewport.width
      off.height = renderViewport.height
      const offCtx = off.getContext('2d')
      if (!offCtx) return

      renderTask = p.render({ canvasContext: offCtx, viewport: renderViewport })
      try {
        await renderTask.promise
      } catch {
        // Cancelled (a newer scale took over — its own render is on the way),
        // or a real failure such as an allocation refused mid-burst. A real
        // failure retries once after a beat rather than leaving the page
        // blank until the next zoom.
        if (!cancelled && attempt === 0) {
          retryTimer = setTimeout(() => {
            void render(1)
          }, 500)
        }
        return
      }
      if (cancelled) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width = off.width
      canvas.height = off.height
      ctx.drawImage(off, 0, 0)
    }

    void render()
    return () => {
      cancelled = true
      renderTask?.cancel()
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [doc, pageIndex, scale, isXfa])

  // Layout effect, not effect: this has to run in the same commit that wrote
  // the new width/height, before the paint. See `onSized`.
  const sized = useRef<string>('')
  useLayoutEffect(() => {
    const key = size ? `${size.width}x${size.height}` : ''
    if (key === sized.current) return
    sized.current = key
    if (key) onSized?.()
  })

  return (
    <div
      data-page-index={pageIndex}
      className="relative shadow-lg mx-auto bg-white scroll-mt-4"
      style={size ? { width: size.width, height: size.height } : undefined}
    >
      {isXfa ? (
        // XFA forms are view + fill only: the interactive HTML layer owns the
        // page, and annotation/redaction tools don't apply (export goes through
        // saveDocument, which can't bake drawn annotations).
        size &&
        page && (
          <XfaPage doc={doc} page={page} scale={scale} width={size.width} height={size.height} />
        )
      ) : (
        <>
          <canvas ref={canvasRef} className="block" />
          {size && <SearchHighlightLayer pageIndex={pageIndex} scale={scale} />}
          {size && (
            <AnnotationLayer pageIndex={pageIndex} width={size.width} height={size.height} scale={scale} />
          )}
          {/* Selectable text overlay — inert unless the Select-text tool is
              active (see TextSelectLayer). Rendered after the annotation Stage
              so it can sit on top while selecting. */}
          {size && page && <TextSelectLayer page={page} scale={scale} />}
          {size && page && (
            <FormFieldLayer
              page={page}
              pageIndex={pageIndex}
              scale={scale}
              pageHeight={size.height}
            />
          )}
        </>
      )}
    </div>
  )
}
