import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, PDFPageProxy } from '../../lib/pdfjs'
import AnnotationLayer from './AnnotationLayer'
import FormFieldLayer from './FormFieldLayer'
import LinkLayer from './LinkLayer'
import SearchHighlightLayer from './SearchHighlightLayer'
import TextSelectLayer from './TextSelectLayer'
import XfaPage from './XfaPage'
import { budgetedPageCount, layerPixelRatio, pagePixelBudget } from '../../lib/renderBudget'
import { requestRenderSlot, type RenderSlot } from '../../lib/renderQueue'
import { usePdfStore } from '../../stores/pdfStore'

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
  /**
   * Whether this page is near enough to the reader to hold pixels at all — its
   * BITMAP, and its interactive layers (the Konva annotation stage, the
   * selectable text overlay, the form fields and the search highlights).
   *
   * ⚠️ Since 2026-09-01 this gates the bitmap too, and that is what lets a
   * retained page be drawn at the screen's own pixel ratio: the document's
   * whole canvas cost is bounded by the band rather than growing with its
   * length, so the allowance is no longer shared with pages nobody is looking
   * at. See `renderBudget`. A page outside the band keeps its LAYOUT BOX and
   * loses only its pixels, so the scroll height never moves.
   *
   * ⚠️ This is the difference between a long document opening and a long
   * document hanging, and the cost is not the pixels. Measured on a 400-page
   * file: with every page carrying its layers, page 1 appeared after **3.73 s**,
   * because all 400 pages' layers mount in ONE React commit and a Konva stage
   * is two more canvases apiece. With the layers held back it was **0.16 s**.
   * (When that was measured the bitmap was drawn either way, and only the
   * layers waited here. The measurement still stands for the layers; the bitmap
   * now waits on the same signal.)
   *
   * Nothing is lost by unmounting: annotations live in `useAnnotationStore` and
   * filled-in field values in `useFormStore`, so a page that scrolls away and
   * comes back is rebuilt from the same state it left.
   */
  active: boolean
}

function PdfPage({ doc, pageIndex, scale, isXfa, active, onSized }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [page, setPage] = useState<PDFPageProxy | null>(null)

  useEffect(() => {
    let cancelled = false
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let slot: RenderSlot | null = null

    // Give the bitmap's memory back. ⚠️ 0×0 rather than `clearRect`: clearing
    // erases the pixels and keeps the allocation, which is the opposite of the
    // point.
    function releaseCanvas() {
      const canvas = canvasRef.current
      if (!canvas || canvas.width === 0) return
      canvas.width = 0
      canvas.height = 0
    }

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
      // eventually (`renderQueue` decides only the order), so a zoomed-in page
      // spends its share of the budget on the bitmap first and gives up
      // sharpness before the zoom itself is capped.
      // ⚠️ `budgetedPageCount`, NOT `doc.numPages`: only the band around the
      // reader holds canvases, so the allowance is shared between those pages
      // and not with a document's worth of pages nobody is looking at. Passing
      // the raw length is what made a long document render at half the linear
      // resolution of a short one — see `renderBudget`.
      const effectiveDpr = layerPixelRatio(
        cssViewport.width,
        cssViewport.height,
        pagePixelBudget(budgetedPageCount(doc.numPages))
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

      // ⚠️ A page outside the band around the reader HOLDS NO BITMAP. Dropping
      // it here is what pays for the resolution above: the whole document's
      // canvas cost is bounded by `MAX_RETAINED_PAGES` however long it is, so
      // each retained page can afford to be drawn at the screen's own pixel
      // ratio. Freed by resizing to 0×0 — assigning to `width` is what releases
      // a canvas's backing store; leaving the element in place keeps the page's
      // layout box, and therefore the document's scroll height, untouched.
      //
      // The size work ABOVE this line still runs for every page on purpose: the
      // box each page occupies is what gives the document its scroll height,
      // and gating that would leave the scrollbar wrong. Only pixels are
      // windowed.
      if (!active) {
        releaseCanvas()
        return
      }

      // ⚠️ Wait for a turn before spending anything on pixels. Everything above
      // is cheap and has to happen for every page immediately — the size is
      // what gives the document its scroll height. Everything below is the
      // expensive half: a full-size offscreen bitmap and a pdf.js render task.
      // Letting all N pages do that in the same tick is what kept page 1 off
      // the screen for the length of the whole document. See `renderQueue`.
      slot = requestRenderSlot(pageIndex)
      const go = await slot.granted
      if (!go || cancelled) return

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
          // ⚠️ Hand the slot back before the retry, or a page that fails twice
          // holds one of the three for the life of the document.
          slot?.release()
          slot = null
          retryTimer = setTimeout(() => {
            runRender(1)
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
      // Page 1 is on screen — the viewer is worth showing now. Reported after
      // the blit, not after `renderTask.promise`, because it is this line that
      // puts pixels in front of the reader.
      if (pageIndex === 0) usePdfStore.getState().markFirstPaint()
    }

    // ⚠️ Every path out of `render` must give the slot back — the early
    // returns (cancelled, no canvas, no 2D context) as much as the happy one —
    // or the queue leaks one of its three and the document stops rendering
    // partway down. ⚠️ The RETRY goes through here too, for the same reason.
    function runRender(attempt = 0) {
      void render(attempt).finally(() => {
        slot?.release()
        slot = null
      })
    }
    runRender()
    return () => {
      cancelled = true
      renderTask?.cancel()
      slot?.release()
      slot = null
      if (retryTimer) clearTimeout(retryTimer)
    }
    // ⚠️ `active` belongs here: it decides whether this page holds pixels at
    // all, so a page entering the band has to rasterize and one leaving it has
    // to let go.
  }, [doc, pageIndex, scale, isXfa, active])

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
          {size && active && <SearchHighlightLayer pageIndex={pageIndex} scale={scale} />}
          {size && active && (
            <AnnotationLayer pageIndex={pageIndex} width={size.width} height={size.height} scale={scale} />
          )}
          {/* Selectable text overlay — inert unless the Select-text tool is
              active (see TextSelectLayer). Rendered after the annotation Stage
              so it can sit on top while selecting. */}
          {size && active && page && (
            <TextSelectLayer page={page} pageIndex={pageIndex} scale={scale} />
          )}
          {/* The page's own hyperlinks. Above the annotation stage so a link
              can be clicked, below the form fields so a widget drawn over one
              still wins. */}
          {size && active && page && <LinkLayer doc={doc} page={page} scale={scale} />}
          {size && active && page && (
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

// ⚠️ Memoised: the viewer re-renders on every change of the anchor page, and
// without this that walks all N pages' subtrees. With it, only the handful
// whose `active` actually flipped re-render.
export default memo(PdfPage)
