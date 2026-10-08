import * as pdfjsLib from 'pdfjs-dist'
// Using ?worker (IIFE format, see vite.config.ts) so iOS Safari gets a classic
// blob-URL worker instead of an ES module worker, which it can't import.
import PdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker'

// ⚠️ ONE pdf.js worker for the life of the app, handed to every document
// EXPLICITLY (`worker:` below) rather than left to `GlobalWorkerOptions`.
//
// The difference is who owns it. A document that pdf.js built its own worker
// for — which is what `workerPort` alone gets you — destroys that worker when
// the document is destroyed, and pdf.js caches the worker per port, so it is
// the SAME worker every other open document is using. Destroying one document
// therefore failed whichever other one was mid-load with "Worker was destroyed"
// / "Transport destroyed" (the Android double-delivery in `nativeOpen.ts`, and
// the reason the export code used to deliberately never destroy its throwaway
// documents — which kept every one of them, bytes and all, alive in the worker
// until the tab closed). A worker passed in by the caller is never destroyed by
// a document, so documents can now be destroyed the moment they are done with.
//
// ⚠️ STARTED ON FIRST USE, not when this module loads (2026-10-08). The viewer
// imports this module, so a module-level `new PdfjsWorker()` booted the whole
// pdf.js worker — 1.3 MB of script and its own JS heap — on the welcome screen,
// before anyone had opened a PDF. `GlobalWorkerOptions.workerPort` is set at
// the same moment, for anything in pdf.js that looks there.
let workerPort: Worker | null = null
let sharedWorker: InstanceType<typeof pdfjsLib.PDFWorker> | null = null
function pdfWorker(): InstanceType<typeof pdfjsLib.PDFWorker> {
  if (!workerPort) {
    workerPort = new PdfjsWorker()
    pdfjsLib.GlobalWorkerOptions.workerPort = workerPort
  }
  // Re-made if anything ever does destroy it — the underlying Web Worker is
  // still running; only pdf.js's handle on it is gone.
  if (!sharedWorker || sharedWorker.destroyed) sharedWorker = pdfjsLib.PDFWorker.fromPort({ port: workerPort })
  return sharedWorker as InstanceType<typeof pdfjsLib.PDFWorker>
}

// pdf.js's CMaps and standard fonts, served with the app (see `pdfjsData()` in
// vite.config.ts). ⚠️ ABSOLUTE: on http(s) pdf.js fetches these from INSIDE the
// worker, whose own URL is a blob:, and a relative path would resolve against
// that. On file:// (Electron), capacitor:// and chrome-extension:// it fetches
// them on the main thread instead, where this resolves just the same.
const dataUrl = (folder: string) =>
  new URL(`${import.meta.env.BASE_URL}${import.meta.env.VITE_PDFJS_DATA_DIR}${folder}/`, document.baseURI).href

type LoadParams = Omit<Parameters<typeof pdfjsLib.getDocument>[0] & object, 'data' | 'url'>

/**
 * Open PDF bytes with pdf.js. EVERY document the app opens goes through here —
 * the viewer, previews, Present, export, compress, convert, OCR — so the shared
 * worker, the font data and the safety flag below can't drift between them.
 */
export function openPdf(data: ArrayBuffer | Uint8Array, extra: LoadParams = {}) {
  return pdfjsLib.getDocument({
    data,
    worker: pdfWorker(),
    cMapUrl: dataUrl('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: dataUrl('standard_fonts'),
    // Never compile anything out of a document into JavaScript. pdf.js uses
    // `new Function` only to speed up PostScript (type 4) functions; the
    // interpreter it falls back to draws the same thing. A PDF is untrusted
    // input, and CVE-2024-4367 was exactly this door.
    isEvalSupported: false,
    ...extra
  })
}

// Load a PDF with XFA support enabled. XFA (XML Forms Architecture) is the
// dynamic-form format produced by Adobe LiveCycle/Designer; such PDFs ship a
// static "please upgrade your PDF viewer" placeholder page that any viewer
// renders when it doesn't understand the XFA layer. enableXfa lets PDF.js parse
// the real form so we can render it (see XfaPage) instead of the placeholder.
// The flag only affects XFA documents — ordinary PDFs and AcroForms are
// unchanged. The viewer's document loads go through here so the flag can't
// drift; throwaway copies (export, preview) use `openPdf` directly.
export function loadPdf(data: ArrayBuffer | Uint8Array) {
  return openPdf(data, { enableXfa: true })
}

// XfaLayer.render() builds the form's HTML; getXfaPageViewport is unused here
// (we size from the static page's viewport) but re-exported for completeness.
// TextLayer builds the selectable transparent text overlay used by the
// "Select text" tool (see TextSelectLayer).
export const { XfaLayer, getXfaPageViewport, TextLayer } = pdfjsLib

export { pdfjsLib }
export type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
