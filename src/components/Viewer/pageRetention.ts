import type { PDFPageProxy } from '../../lib/pdfjs'

// Who is still using a pdf.js page, so its parsed content can be freed the
// moment nobody is.
//
// ⚠️ Dropping a page's BITMAP (see `PdfPage`'s `active`) is only half of what a
// page costs. pdf.js keeps a second copy of every page it has rendered: the
// operator list the worker parsed it into, and every image in it, decoded.
// That lives on the `PDFPageProxy`, which `doc.getPage()` caches for the life
// of the document — so before this, scrolling through a 500-page scan left all
// 500 pages' decoded images in memory however far behind the reader they were.
// `page.cleanup()` is what lets them go.
//
// It is reference-counted because two things render pages: the viewer (for the
// band around the reader) and the page navigator (one thumbnail at a time).
// `doc.getPage(n)` hands both the SAME proxy, so a thumbnail finishing must not
// free a page the viewer is still showing — the next zoom would then re-parse
// it from scratch in the worker. Keyed on the proxy itself, so a new document
// (new proxies) starts clean and an old one is garbage-collected with its map.
//
// ⚠️ pdf.js refuses to clean up a page with a render task still in flight and
// marks it pending instead, finishing the job when that task settles. So the
// holders cancel their own render first; the deferral is a backstop, not the
// plan.
const holds = new WeakMap<PDFPageProxy, number>()

/**
 * Mark `page` as in use. Returns the release — call it exactly once (extra
 * calls are ignored). The last release frees the page's pdf.js resources; the
 * proxy itself stays valid and simply re-fetches what it needs next render.
 */
export function holdPage(page: PDFPageProxy): () => void {
  holds.set(page, (holds.get(page) ?? 0) + 1)
  let released = false
  return () => {
    if (released) return
    released = true
    const left = (holds.get(page) ?? 1) - 1
    if (left > 0) {
      holds.set(page, left)
      return
    }
    holds.delete(page)
    try {
      page.cleanup()
    } catch {
      // A document closed underneath us has already freed everything.
    }
  }
}
