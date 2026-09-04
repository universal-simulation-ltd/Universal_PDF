import { useEffect, useRef } from 'react'
import { TextLayer } from '../../lib/pdfjs'
import type { PDFPageProxy } from '../../lib/pdfjs'
import { useAnnotationStore } from '../../stores/annotationStore'
import { selectWordAtPoint, takeWordSelect } from '../../lib/wordSelect'

// A transparent, selectable copy of the page's own text, built with PDF.js's
// TextLayer and overlaid on top of the rendered canvas. It's the "Select text"
// tool: drag to highlight the PDF's real text and Ctrl/Cmd+C to copy it — as
// opposed to the 'select' tool, which selects/moves the annotations drawn on
// top.
//
// The layer is inert (pointer-events:none, see textlayer.css) unless the
// Select-text tool is active, so it never intercepts annotation editing. To
// avoid extracting text for every page during normal editing, the spans are
// only built while the tool is active and rebuilt when the zoom (scale)
// changes — keeping the selection aligned to the rendered glyphs (the
// "synced to zoom" requirement).
export default function TextSelectLayer({
  page,
  pageIndex,
  scale
}: {
  page: PDFPageProxy
  pageIndex: number
  scale: number
}) {
  const active = useAnnotationStore((s) => s.tool === 'selecttext')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Tool not active: keep the node in the tree but empty + cheap.
    if (!active) {
      container.replaceChildren()
      return
    }

    let cancelled = false
    let layer: { cancel: () => void } | null = null

    container.replaceChildren()
    // PDF.js positions every run with calc(var(--scale-factor) * Npx), so the
    // container must advertise the current display scale (zoom × BASE_SCALE).
    container.style.setProperty('--scale-factor', String(scale))

    const viewport = page.getViewport({ scale })
    ;(async () => {
      try {
        const textContentSource = await page.getTextContent()
        if (cancelled) return
        const textLayer = new TextLayer({ textContentSource, container, viewport })
        layer = textLayer
        await textLayer.render()
        if (cancelled) return
        // A double-click on this page with the Select tool switched the tool to
        // get here — the spans it wanted to hit-test now exist, so make the
        // selection it asked for.
        const req = takeWordSelect(pageIndex)
        if (req && !selectWordAtPoint(req.clientX, req.clientY)) {
          // Blank page under the double-click — undo the tool switch so it
          // reads as the no-op it was.
          const store = useAnnotationStore.getState()
          if (store.tool === 'selecttext') store.setTool(req.fromTool)
        }
      } catch {
        // Render cancelled (zoom changed / unmounted) — ignore.
      }
    })()

    return () => {
      cancelled = true
      try {
        layer?.cancel()
      } catch {
        /* noop */
      }
      container.replaceChildren()
    }
  }, [page, pageIndex, scale, active])

  return (
    <div
      ref={containerRef}
      className={`textLayer pdf-text-select${active ? ' pdf-text-select--active' : ''}`}
      aria-hidden={!active}
    />
  )
}
