import { PDFDocument } from 'pdf-lib'
import { openPdf, type PDFDocumentProxy } from './pdfjs'
import { getT } from '../i18n'
import { drawInvisibleWords, embedGlyphlessFont, type InvisibleWord } from './ocrTextLayer'
import { joinLineWords, laysOutByLine } from './ocrLanguages'

/**
 * In-browser OCR — turns scanned / image-only PDFs into searchable, selectable
 * documents **entirely client-side**. Nothing is uploaded.
 *
 * The recognition runs on-device via Tesseract.js (a WebAssembly port of the
 * Tesseract engine). Its worker script and WASM core ship WITH the app (see
 * `ocrRuntime()` in vite.config.ts); the one thing fetched from elsewhere is
 * the language model (0.7–3 MB, one per language — see `ocrLanguages.ts`), from
 * Tesseract's CDN on first use and then cached by tesseract (IndexedDB) and by
 * the PWA service worker. Nothing
 * of the user's goes anywhere. This
 * keeps the feature on-brand with the rest of the suite: local-first, no server
 * round-trip, no account — the same pattern the Images app uses for its
 * on-device background removal.
 *
 * We keep the original PDF pages intact and add an **invisible text layer** on
 * top: every recognised word is written in text-rendering mode 3 (invisible),
 * in a glyphless font that carries any script (`ocrTextLayer.ts`), at its
 * detected position, so the scanned image still shows through but the text underneath is
 * selectable and searchable (Find, copy/paste, redact-by-search all light up).
 */

// Words below this OCR confidence are dropped from the text layer — they're
// usually noise (specks, edges) and would only pollute search/selection.
const MIN_CONFIDENCE = 30

// Cap the longest rendered edge so a huge scan can't blow out memory. OCR
// quality plateaus well before this; 300-DPI-ish A4 is ~2500px.
const MAX_RENDER_EDGE = 3000
// Baseline render multiplier over the page's natural (scale-1) size. Higher =
// better recognition, slower. 2× lands most text-sized glyphs well above the
// ~20px Tesseract likes.
const RENDER_SCALE = 2

/** A page already carrying at least this many non-space characters is treated
 *  as already-textual and skipped in `auto` mode (its real text is preserved). */
const TEXTUAL_PAGE_MIN_CHARS = 16

// The worker script + WASM cores, copied into the build by `ocrRuntime()` in
// vite.config.ts. Relative to BASE_URL, so it lands under `/pdf/` on the web
// and beside index.html in the desktop, phone and extension builds (`./`) —
// tesseract turns it into an absolute URL against the page before the worker
// sees it.
//
// ⚠️ `corePath` is the FOLDER, not a file, on purpose: given a folder,
// tesseract chooses the SIMD or the plain core for the engine it is running
// on. Naming one file here would hand the SIMD build to a browser that cannot
// run it, or the slow build to every one that can.
//
// ⚠️ The language models are NOT self-hosted. `langPath` is left unset, so
// each comes from tesseract's own CDN (cdn.jsdelivr.net/npm/@tesseract.js-data)
// — 0.7–3 MB of data rather than code per language, fetched once and cached,
// and shipping all eleven would add ~19 MB to every install for a tool most
// people never open.
const OCR_RUNTIME_URL = `${import.meta.env.BASE_URL}${import.meta.env.VITE_OCR_RUNTIME_DIR}`

export interface OcrProgress {
  phase: 'load' | 'recognize' | 'build'
  /** 1-based page currently being read (recognize phase only). */
  page?: number
  totalPages?: number
  /** Overall 0..1 across model load + every page — drives a determinate bar. */
  fraction: number
  /** Human-readable status for the modal. */
  message: string
}

export type OcrProgressCb = (p: OcrProgress) => void

export interface OcrResult {
  bytes: Uint8Array
  /** `name.pdf` → `name-searchable.pdf`. */
  fileName: string
  /** Pages that had a text layer added. */
  pagesOcred: number
  /** Pages left untouched because they already had selectable text. */
  pagesSkipped: number
  /** Total characters added across the document. */
  charsAdded: number
}

export interface OcrOptions {
  /**
   * `auto` (default) skips pages that already have selectable text — only
   * image-only pages get OCR'd. `all` forces OCR on every page.
   */
  mode?: 'auto' | 'all'
  /** Tesseract model(s), e.g. `'eng'` (default), `'jpn'` or `'eng+fra'` — see `lib/ocrLanguages.ts`. */
  lang?: string
}

// How much of a page's own text pdf.js can already extract. Used by `auto` mode
// to leave real, born-digital pages alone.
async function pageTextLength(doc: PDFDocumentProxy, pageIndex: number): Promise<number> {
  try {
    const page = await doc.getPage(pageIndex + 1)
    const content = await page.getTextContent()
    let n = 0
    for (const item of content.items) {
      if ('str' in item) n += (item as { str: string }).str.replace(/\s/g, '').length
    }
    return n
  } catch {
    return 0
  }
}

interface RenderedPage {
  canvas: HTMLCanvasElement
  /** pdf.js viewport at the render scale — used for pixel→PDF-point mapping. */
  viewport: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['getViewport']>
}

async function renderPage(doc: PDFDocumentProxy, pageIndex: number): Promise<RenderedPage> {
  const page = await doc.getPage(pageIndex + 1)
  const base = page.getViewport({ scale: 1 })
  const longest = Math.max(base.width, base.height)
  const scale = Math.min(RENDER_SCALE, MAX_RENDER_EDGE / longest)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  // Paint white first so any transparent regions OCR as background, not black.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  return { canvas, viewport }
}

interface OcrWord {
  text: string
  bbox: { x0: number; y0: number; x1: number; y1: number }
  confidence: number
}

interface OcrLine {
  bbox: OcrWord['bbox']
  words: OcrWord[]
}

/**
 * What to write for one recognised page. Per word for most scripts; per LINE
 * for Japanese and Chinese, whose word boxes drift (see `laysOutByLine`).
 */
function pageWords(
  data: { words?: OcrWord[]; lines?: OcrLine[] },
  byLine: boolean,
  viewport: RenderedPage['viewport'],
): InvisibleWord[] {
  const placed: InvisibleWord[] = []
  if (byLine) {
    for (const line of data.lines ?? []) {
      const text = joinLineWords((line.words ?? []).filter((w) => w && w.confidence >= MIN_CONFIDENCE).map((w) => w.text))
      const p = text ? placeWord(viewport, { text, bbox: line.bbox, confidence: 100 }) : null
      if (p) placed.push(p)
    }
    return placed
  }
  for (const w of data.words ?? []) {
    if (!w || w.confidence < MIN_CONFIDENCE) continue
    const p = placeWord(viewport, w)
    if (p) placed.push(p)
  }
  return placed
}

// Map one recognised word's pixel box onto the page as an invisible word.
// Handles page rotation/CropBox transparently by mapping pixel corners through
// pdf.js's viewport, then deriving the baseline direction + length as vectors —
// so the layer lines up whether the page is upright or rotated.
function placeWord(viewport: RenderedPage['viewport'], word: OcrWord): InvisibleWord | null {
  const text = word.text.trim()
  if (!text) return null
  const { x0, y0, x1, y1 } = word.bbox
  // convertToPdfPoint maps a canvas (device) pixel to a PDF user-space point,
  // accounting for scale, rotation and the CropBox origin.
  const [blx, bly] = viewport.convertToPdfPoint(x0, y1) // baseline start (bottom-left)
  const [brx, bry] = viewport.convertToPdfPoint(x1, y1) // baseline end (bottom-right)
  const [tlx, tly] = viewport.convertToPdfPoint(x0, y0) // top-left
  const width = Math.hypot(brx - blx, bry - bly)
  const height = Math.hypot(tlx - blx, tly - bly)
  if (!(width > 0) || !(height > 0)) return null
  return { text, x: blx, y: bly, width, height, angle: Math.atan2(bry - bly, brx - blx) }
}

/**
 * The language a PDF says its text is in (the catalog's /Lang), or null. The
 * OCR dialog starts on it when there is one — a scan usually has none, and the
 * app's own language is the fallback.
 */
export async function documentLanguage(sourceBytes: ArrayBuffer): Promise<string | null> {
  let doc: PDFDocumentProxy | null = null
  try {
    doc = await openPdf(sourceBytes.slice(0)).promise
    const { info } = await doc.getMetadata()
    const lang = (info as { Language?: unknown } | undefined)?.Language
    return typeof lang === 'string' && lang.trim() ? lang.trim() : null
  } catch {
    return null
  } finally {
    void doc?.destroy()
  }
}

/**
 * Build a searchable copy of `sourceBytes` by OCR-ing its image-only pages and
 * baking an invisible text layer over each. Runs fully in the browser.
 *
 * `onProgress` reports a determinate 0..1 fraction across the one-time model
 * download and every page, so the UI can show a real progress bar on first use.
 */
export async function makeSearchablePdf(
  sourceBytes: ArrayBuffer,
  fileName: string,
  onProgress?: OcrProgressCb,
  options: OcrOptions = {},
): Promise<OcrResult> {
  const mode = options.mode ?? 'auto'
  const lang = options.lang ?? 'eng'
  const outName = fileName.replace(/\.pdf$/i, '') + '-searchable.pdf'

  onProgress?.({ phase: 'load', fraction: 0, message: getT()('lib.ocr_preparing') })

  // pdf.js detaches any ArrayBuffer it's handed — give it its own copy and keep
  // the caller's `sourceBytes` intact for pdf-lib below.
  const pdfjsDoc = await openPdf(sourceBytes.slice(0)).promise
  const numPages = pdfjsDoc.numPages

  // Decide up front which pages need OCR so progress + the model-load weighting
  // reflect the real workload.
  const pagesToOcr: number[] = []
  for (let i = 0; i < numPages; i++) {
    if (mode === 'all' || (await pageTextLength(pdfjsDoc, i)) < TEXTUAL_PAGE_MIN_CHARS) {
      pagesToOcr.push(i)
    }
  }

  // Every page already has text — nothing to do. Return the source untouched so
  // the caller can tell the user it's already searchable.
  if (pagesToOcr.length === 0) {
    pdfjsDoc.destroy()
    const passthrough = new Uint8Array(sourceBytes.slice(0))
    onProgress?.({ phase: 'build', fraction: 1, message: getT()('lib.ocr_already_searchable') })
    return { bytes: passthrough, fileName: outName, pagesOcred: 0, pagesSkipped: numPages, charsAdded: 0 }
  }

  // Model load counts as the first slice of the bar; each page shares the rest.
  const LOAD_WEIGHT = 0.15
  const perPage = (1 - LOAD_WEIGHT) / pagesToOcr.length

  // Lazy import: Tesseract.js (+ its worker/WASM core, fetched from the app's
  // own `ocr/` folder on first use) is only pulled in when the user actually
  // runs OCR, keeping the initial app bundle lean for everyone who never
  // touches this feature.
  const { createWorker } = await import('tesseract.js')

  // Shared with the loop below so the logger can interpolate the live page's
  // recognition progress into that page's slice of the overall bar.
  let modelLoaded = false
  let currentSlot = 0
  const worker = await createWorker(lang, 1, {
    workerPath: `${OCR_RUNTIME_URL}worker.min.js`,
    corePath: OCR_RUNTIME_URL,
    // ⚠️ Off because the worker is now same-origin. The blob: wrapper exists to
    // load a CROSS-origin worker script, and a blob: worker is exactly what the
    // extension's CSP (`script-src 'self'`) refuses — the same way pdf.js's
    // worker is a real file here and not a blob.
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') {
        // Smoothly fill the current page's slice as Tesseract works through it.
        onProgress?.({
          phase: 'recognize',
          page: currentSlot + 1,
          totalPages: pagesToOcr.length,
          fraction: LOAD_WEIGHT + perPage * (currentSlot + (m.progress || 0)),
          message: getT()('lib.ocr_reading_page', { page: currentSlot + 1, total: pagesToOcr.length }),
        })
      } else if (!modelLoaded && m.status) {
        // Before the first page's recognition, surface the model download so the
        // one-time fetch (core + model, ~7 MB) isn't a dead-looking bar.
        const label = /download|load|initializ|initialis/i.test(m.status)
          ? getT()('lib.ocr_downloading_model')
          : getT()('lib.ocr_preparing')
        onProgress?.({ phase: 'load', fraction: LOAD_WEIGHT * (m.progress || 0), message: label })
      }
    },
  })
  modelLoaded = true

  const outDoc = await PDFDocument.load(sourceBytes, { updateMetadata: false })
  // One invisible font for every script — see `lib/ocrTextLayer.ts`.
  const font = embedGlyphlessFont(outDoc)
  const byLine = laysOutByLine(lang)
  const outPages = outDoc.getPages()

  let charsAdded = 0
  try {
    for (let n = 0; n < pagesToOcr.length; n++) {
      const pageIndex = pagesToOcr[n]
      currentSlot = n
      onProgress?.({
        phase: 'recognize',
        page: n + 1,
        totalPages: pagesToOcr.length,
        fraction: LOAD_WEIGHT + perPage * n,
        message: getT()('lib.ocr_reading_page', { page: n + 1, total: pagesToOcr.length }),
      })

      const { canvas, viewport } = await renderPage(pdfjsDoc, pageIndex)
      const { data } = await worker.recognize(canvas, {}, { text: false, blocks: true })
      // Free the canvas eagerly — a multi-page scan holds a lot of pixels.
      canvas.width = 0
      canvas.height = 0

      const page = outPages[pageIndex]
      if (page) {
        const placed = pageWords(data as { words?: OcrWord[]; lines?: OcrLine[] }, byLine, viewport)
        charsAdded += drawInvisibleWords(page, font, placed)
      }

      onProgress?.({
        phase: 'recognize',
        page: n + 1,
        totalPages: pagesToOcr.length,
        fraction: LOAD_WEIGHT + perPage * (n + 1),
        message: getT()('lib.ocr_reading_page', { page: n + 1, total: pagesToOcr.length }),
      })
    }
  } finally {
    await worker.terminate()
    pdfjsDoc.destroy()
  }

  onProgress?.({ phase: 'build', fraction: 0.99, message: getT()('lib.ocr_saving') })
  const bytes = await outDoc.save()
  onProgress?.({ phase: 'build', fraction: 1, message: getT()('lib.ocr_done') })

  return {
    bytes,
    fileName: outName,
    pagesOcred: pagesToOcr.length,
    pagesSkipped: numPages - pagesToOcr.length,
    charsAdded,
  }
}
