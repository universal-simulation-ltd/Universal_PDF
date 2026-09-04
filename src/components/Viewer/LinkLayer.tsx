import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, PDFPageProxy } from '../../lib/pdfjs'
import { useAnnotationStore } from '../../stores/annotationStore'
import { linkLabel, safeLinkUrl, scrollToPage } from '../../lib/links'

// The page's own hyperlinks, made clickable.
//
// A PDF stores a link as an annotation: a rectangle plus either a URI (open the
// web) or a destination (jump inside this document). Neither is part of the
// page's drawn content, so rasterizing the page — which is all the canvas does —
// produces a picture of the underlined blue text and nothing that responds to a
// click. This layer is what turns those rectangles back into links.
//
// It follows FormFieldLayer's shape: a full-page container that is inert
// (pointer-events: none) with one interactive box per link, so everything
// between the links falls straight through to the Konva annotation stage
// underneath. It sits BELOW the form fields (z 20) — a widget drawn over a link
// is the thing being clicked — and above the stage.

interface LinkBox {
  key: string
  // Viewport coordinates at scale 1, multiplied by the live `scale` when drawn.
  // Kept unscaled so a zoom re-renders without re-reading the annotations.
  x: number
  y: number
  w: number
  h: number
  // Exactly one of these. A link with neither (a bare /Launch or /JavaScript
  // action, or a URI we refuse to follow) is dropped rather than rendered as a
  // box that does nothing.
  url: string | null
  page: number | null
}

/**
 * Which page an internal link lands on. The destination is either a name to look
 * up in the document's name tree, or an explicit array whose first element is
 * the page — a ref to resolve, or (rarely) an index already.
 */
async function destinationPage(
  doc: PDFDocumentProxy,
  dest: unknown
): Promise<number | null> {
  try {
    const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest
    if (!Array.isArray(explicit) || explicit.length === 0) return null
    const ref = explicit[0]
    if (typeof ref === 'number') return ref
    if (ref && typeof ref === 'object') return await doc.getPageIndex(ref as never)
    return null
  } catch {
    return null
  }
}

export default function LinkLayer({
  doc,
  page,
  scale
}: {
  doc: PDFDocumentProxy
  page: PDFPageProxy
  scale: number
}) {
  const [links, setLinks] = useState<LinkBox[]>([])
  // Which tools let a link be followed. The drawing tools deliberately do not:
  // a highlight dragged across a hyperlink has to draw, not navigate, and a box
  // that swallowed the gesture would be a worse bug than the one this fixes.
  // 'selecttext' is out for the same reason — a drag over a link is a text
  // selection.
  const live = useAnnotationStore((s) => s.tool === 'select' || s.tool === 'hand')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let anns: Awaited<ReturnType<PDFPageProxy['getAnnotations']>>
      try {
        anns = await page.getAnnotations()
      } catch {
        return
      }
      if (cancelled) return
      // ⚠️ `convertToViewportRectangle`, not a hand-rolled Y flip: it carries
      // the page's /Rotate too, so links stay on their words in a document
      // that was scanned sideways. The rectangle comes back with its corners in
      // whatever order the flip left them, hence the min/abs.
      const viewport = page.getViewport({ scale: 1 })
      const boxes: LinkBox[] = []
      for (let i = 0; i < anns.length; i++) {
        const ann = anns[i] as Record<string, unknown>
        if (ann.subtype !== 'Link' || !Array.isArray(ann.rect)) continue
        const url = safeLinkUrl(ann.url)
        const target = url ? null : await destinationPage(doc, ann.dest)
        if (cancelled) return
        if (!url && target === null) continue
        const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(
          ann.rect as number[]
        ) as number[]
        const w = Math.abs(x2 - x1)
        const h = Math.abs(y2 - y1)
        // A zero-height link can't be clicked and isn't visible either.
        if (w < 1 || h < 1) continue
        boxes.push({
          key: (ann.id as string) ?? `link-${i}`,
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          w,
          h,
          url,
          page: target
        })
      }
      if (!cancelled) setLinks(boxes)
    })()
    return () => {
      cancelled = true
    }
  }, [doc, page])

  // The Hand tool pans by dragging the scroll container, and that listener sits
  // on an ANCESTOR of these boxes — so a pan that happens to start on a link
  // still pans, and then the browser delivers a click to the link it started
  // on. Without this the document would navigate away every time someone
  // grabbed the page by a hyperlink.
  const down = useRef<{ x: number; y: number } | null>(null)
  function onPointerDown(e: React.PointerEvent) {
    down.current = { x: e.clientX, y: e.clientY }
  }
  function dragged(e: { clientX: number; clientY: number }): boolean {
    const start = down.current
    down.current = null
    if (!start) return false
    return Math.abs(e.clientX - start.x) > 5 || Math.abs(e.clientY - start.y) > 5
  }

  if (links.length === 0) return null

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 15 }}>
      {links.map((l) => {
        const style: React.CSSProperties = {
          position: 'absolute',
          left: l.x * scale,
          top: l.y * scale,
          width: l.w * scale,
          height: l.h * scale,
          pointerEvents: live ? 'auto' : 'none'
        }
        const className =
          'block rounded-[2px] cursor-pointer transition-colors ' +
          'hover:bg-blue-500/20 hover:outline hover:outline-1 hover:outline-blue-500/60 ' +
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600'
        if (l.url) {
          return (
            <a
              key={l.key}
              data-pdf-link={l.url}
              href={l.url}
              // A new tab, so the click can never throw away the document the
              // reader has open — with unfilled form fields and unsaved
              // annotations in it. `noopener` also denies the target page a
              // handle back to this one.
              target="_blank"
              rel="noopener noreferrer"
              title={linkLabel(l.url)}
              aria-label={`Open link: ${linkLabel(l.url)}`}
              style={style}
              className={className}
              onPointerDown={onPointerDown}
              onClick={(e) => {
                if (dragged(e)) e.preventDefault()
              }}
            />
          )
        }
        const target = l.page as number
        return (
          <button
            key={l.key}
            type="button"
            data-pdf-link={`page:${target + 1}`}
            title={`Go to page ${target + 1}`}
            aria-label={`Go to page ${target + 1}`}
            style={style}
            className={className}
            onPointerDown={onPointerDown}
            onClick={(e) => {
              if (dragged(e)) return
              scrollToPage(target)
            }}
          />
        )
      })}
    </div>
  )
}
