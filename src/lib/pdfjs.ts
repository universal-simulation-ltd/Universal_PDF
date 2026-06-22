import * as pdfjsLib from 'pdfjs-dist'
// Using ?worker (IIFE format, see vite.config.ts) so iOS Safari gets a classic
// blob-URL worker instead of an ES module worker, which it can't import.
import PdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker'

pdfjsLib.GlobalWorkerOptions.workerPort = new PdfjsWorker()

// Load a PDF with XFA support enabled. XFA (XML Forms Architecture) is the
// dynamic-form format produced by Adobe LiveCycle/Designer; such PDFs ship a
// static "please upgrade your PDF viewer" placeholder page that any viewer
// renders when it doesn't understand the XFA layer. enableXfa lets PDF.js parse
// the real form so we can render it (see XfaPage) instead of the placeholder.
// The flag only affects XFA documents — ordinary PDFs and AcroForms are
// unchanged. Always route document loads through here so the flag can't drift.
export function loadPdf(data: ArrayBuffer | Uint8Array) {
  return pdfjsLib.getDocument({ data, enableXfa: true })
}

// XfaLayer.render() builds the form's HTML; getXfaPageViewport is unused here
// (we size from the static page's viewport) but re-exported for completeness.
export const { XfaLayer, getXfaPageViewport } = pdfjsLib

export { pdfjsLib }
export type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
