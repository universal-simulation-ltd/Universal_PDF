import { useEffect, useRef, useState } from 'react'
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
}

export default function PdfPage({ doc, pageIndex, scale, isXfa }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [page, setPage] = useState<PDFPageProxy | null>(null)

  useEffect(() => {
    let cancelled = false
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null

    async function render() {
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
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      canvas.width = renderViewport.width
      canvas.height = renderViewport.height
      canvas.style.width = `${cssViewport.width}px`
      canvas.style.height = `${cssViewport.height}px`
      setSize({ width: cssViewport.width, height: cssViewport.height })

      renderTask = p.render({ canvasContext: ctx, viewport: renderViewport })
      try {
        await renderTask.promise
      } catch {
        // render cancelled; ignore
      }
    }

    render()
    return () => {
      cancelled = true
      renderTask?.cancel()
    }
  }, [doc, pageIndex, scale, isXfa])

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
