import { useEffect, useRef } from 'react'
import { XfaLayer, type PDFDocumentProxy, type PDFPageProxy } from '../../lib/pdfjs'

// XfaLayer.render() only ever calls linkService.addLinkAttributes() (for <a>
// elements inside the form). We don't run a full PDFLinkService — internal
// navigation/named-destinations aren't meaningful in this single-document
// viewer — so a one-method stub that just wires external links is enough.
type XfaLinkService = Parameters<typeof XfaLayer.render>[0]['linkService']

const linkService = {
  addLinkAttributes(link: HTMLAnchorElement, url: string, newWindow?: boolean) {
    link.href = url || ''
    if (newWindow) {
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
    }
  }
  // Cast: XfaLayer.render's type wants a full IPDFLinkService, but its XFA code
  // path only ever calls addLinkAttributes (verified in pdfjs-dist source).
} as unknown as XfaLinkService

interface Props {
  doc: PDFDocumentProxy
  page: PDFPageProxy
  scale: number
  width: number
  height: number
}

// Renders one page of an XFA form as live HTML. Field edits are written into
// doc.annotationStorage (PDF.js wires the inputs up via XfaLayer's setupStorage),
// which is what doc.saveDocument() later serializes back into the PDF — that's
// how filled values survive export. See ExportModal's XFA branch.
export default function XfaPage({ doc, page, scale, width, height }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    const container = containerRef.current
    if (!container) return

    ;(async () => {
      const xfaHtml = await page.getXfa()
      if (cancelled || !container || !xfaHtml) return
      // dontFlip: XFA HTML lays out top-down like the DOM, so it must not get
      // the PDF's bottom-left-origin Y flip that the canvas viewport uses.
      const viewport = page.getViewport({ scale }).clone({ dontFlip: true })
      // Clear any previous render (e.g. after a zoom change re-runs this effect).
      container.textContent = ''
      const div = document.createElement('div')
      container.append(div)
      // XfaLayer.render sets div.className ("xfaLayer xfaFont") and the viewport
      // transform itself; we only supply the container and the storage hookup.
      XfaLayer.render({
        viewport,
        div,
        xfaHtml,
        annotationStorage: doc.annotationStorage,
        linkService,
        intent: 'display'
      })
    })().catch(() => {
      // A form PDF.js can't render (e.g. unsupported dynamic XFA) leaves the
      // container empty; PdfViewer's banner already warns the user.
    })

    return () => {
      cancelled = true
      if (container) container.textContent = ''
    }
  }, [doc, page, scale])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      style={{ width, height }}
    />
  )
}
