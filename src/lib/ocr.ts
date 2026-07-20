import { PDFDocument, StandardFonts, degrees, type PDFFont } from 'pdf-lib'
import { pdfjsLib, type PDFDocumentProxy } from './pdfjs'

/**
 * In-browser OCR — turns scanned / image-only PDFs into searchable, selectable
 * documents **entirely client-side**. Nothing is uploaded.
 *
 * The recognition runs on-device via Tesseract.js (a WebAssembly port of the
 * Tesseract engine). The only thing that leaves the browser is a one-time
 * download of the WASM core + the English language model (~15 MB), fetched from
 * Tesseract's official CDN on first use and then cached by the browser (and by
 * the PWA service worker — see the runtime-caching rule in vite.config.ts). This
 * keeps the feature on-brand with the rest of the suite: local-first, no server
 * round-trip, no account — the same pattern the Images app uses for its
 * on-device background removal.
 *
 * We keep the original PDF pages intact and add an **invisible text layer** on
 * top: every recognised word is drawn transparently (opacity 0) at its detected
 * position, so the scanned image still shows through but the text underneath is
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
  /** Tesseract language code(s), e.g. `'eng'` (default) or `'eng+fra'`. */
  lang?: string
}

// WinAnsi (cp1252) coverage beyond ASCII + Latin-1, mirroring export.ts — the
// standard Helvetica we embed can't encode arbitrary Unicode, so anything
// outside this set is dropped from a word rather than crashing the encode. The
// visible glyph still comes from the scanned image; this only affects the
// invisible search text, so a dropped exotic char just isn't independently
// searchable.
const WIN_ANSI_EXTRAS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160,
  0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
])

function sanitizeForWinAnsi(text: string): string {
  let out = ''
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    if ((cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff) || WIN_ANSI_EXTRAS.has(cp)) {
      out += ch
    }
  }
  return out
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

// Draw one recognised word as invisible, correctly-placed text. Handles page
// rotation/CropBox transparently by mapping pixel corners through pdf.js's
// viewport, then deriving the baseline direction + length as vectors — so the
// layer lines up whether the page is upright or rotated.
function drawInvisibleWord(
  page: ReturnType<PDFDocument['getPage']>,
  font: PDFFont,
  viewport: RenderedPage['viewport'],
  word: OcrWord,
): number {
  const text = sanitizeForWinAnsi(word.text).trim()
  if (!text) return 0

  const { x0, y0, x1, y1 } = word.bbox
  // convertToPdfPoint maps a canvas (device) pixel to a PDF user-space point,
  // accounting for scale, rotation and the CropBox origin.
  const [blx, bly] = viewport.convertToPdfPoint(x0, y1) // baseline start (bottom-left)
  const [brx, bry] = viewport.convertToPdfPoint(x1, y1) // baseline end (bottom-right)
  const [tlx, tly] = viewport.convertToPdfPoint(x0, y0) // top-left

  const baseDx = brx - blx
  const baseDy = bry - bly
  const boxWidth = Math.hypot(baseDx, baseDy)
  const boxHeight = Math.hypot(tlx - blx, tly - bly)
  if (boxWidth <= 0 || boxHeight <= 0) return 0

  const angleDeg = (Math.atan2(baseDy, baseDx) * 180) / Math.PI

  // Fit the font so the word's rendered width matches the detected box width —
  // this keeps search-highlight / selection rectangles aligned with the glyphs
  // in the image. Fall back to a height-based size if the metric is unusable.
  const widthAtOne = font.widthOfTextAtSize(text, 1)
  let fontSize = widthAtOne > 0 ? boxWidth / widthAtOne : boxHeight * 0.8
  if (!Number.isFinite(fontSize) || fontSize <= 0) fontSize = boxHeight * 0.8
  // Guard against a runaway size from a 1-char box or bad metric.
  fontSize = Math.min(fontSize, boxHeight * 2)

  // Nudge the baseline up off the box bottom by a typical descender fraction,
  // along the box's "up" direction (handles rotation).
  const upX = (tlx - blx) / boxHeight
  const upY = (tly - bly) / boxHeight
  const lift = boxHeight * 0.15

  page.drawText(text, {
    x: blx + upX * lift,
    y: bly + upY * lift,
    size: fontSize,
    font,
    opacity: 0, // invisible: the scanned image shows through, text stays selectable
    rotate: angleDeg !== 0 ? degrees(angleDeg) : undefined,
  })
  return text.length
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

  onProgress?.({ phase: 'load', fraction: 0, message: 'Preparing OCR engine…' })

  // pdf.js detaches any ArrayBuffer it's handed — give it its own copy and keep
  // the caller's `sourceBytes` intact for pdf-lib below.
  const pdfjsDoc = await pdfjsLib.getDocument({ data: sourceBytes.slice(0) }).promise
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
    onProgress?.({ phase: 'build', fraction: 1, message: 'Already searchable' })
    return { bytes: passthrough, fileName: outName, pagesOcred: 0, pagesSkipped: numPages, charsAdded: 0 }
  }

  // Model load counts as the first slice of the bar; each page shares the rest.
  const LOAD_WEIGHT = 0.15
  const perPage = (1 - LOAD_WEIGHT) / pagesToOcr.length

  // Lazy import: Tesseract.js (+ its worker/WASM glue, fetched from CDN on first
  // use) is only pulled in when the user actually runs OCR, keeping the initial
  // app bundle lean for everyone who never touches this feature.
  const { createWorker } = await import('tesseract.js')

  // Shared with the loop below so the logger can interpolate the live page's
  // recognition progress into that page's slice of the overall bar.
  let modelLoaded = false
  let currentSlot = 0
  const worker = await createWorker(lang, 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') {
        // Smoothly fill the current page's slice as Tesseract works through it.
        onProgress?.({
          phase: 'recognize',
          page: currentSlot + 1,
          totalPages: pagesToOcr.length,
          fraction: LOAD_WEIGHT + perPage * (currentSlot + (m.progress || 0)),
          message: `Reading page ${currentSlot + 1} of ${pagesToOcr.length}…`,
        })
      } else if (!modelLoaded && m.status) {
        // Before the first page's recognition, surface the model download so the
        // ~15 MB one-time fetch isn't a dead-looking bar.
        const label = /download|load|initializ|initialis/i.test(m.status)
          ? 'Downloading OCR model (one-time)…'
          : 'Preparing OCR engine…'
        onProgress?.({ phase: 'load', fraction: LOAD_WEIGHT * (m.progress || 0), message: label })
      }
    },
  })
  modelLoaded = true

  const outDoc = await PDFDocument.load(sourceBytes)
  const font = await outDoc.embedFont(StandardFonts.Helvetica)
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
        message: `Reading page ${n + 1} of ${pagesToOcr.length}…`,
      })

      const { canvas, viewport } = await renderPage(pdfjsDoc, pageIndex)
      const { data } = await worker.recognize(canvas, {}, { text: false, blocks: true })
      // Free the canvas eagerly — a multi-page scan holds a lot of pixels.
      canvas.width = 0
      canvas.height = 0

      const words = (data.words ?? []) as OcrWord[]
      const page = outPages[pageIndex]
      if (page) {
        for (const w of words) {
          if (!w || w.confidence < MIN_CONFIDENCE) continue
          charsAdded += drawInvisibleWord(page, font, viewport, w)
        }
      }

      onProgress?.({
        phase: 'recognize',
        page: n + 1,
        totalPages: pagesToOcr.length,
        fraction: LOAD_WEIGHT + perPage * (n + 1),
        message: `Reading page ${n + 1} of ${pagesToOcr.length}…`,
      })
    }
  } finally {
    await worker.terminate()
    pdfjsDoc.destroy()
  }

  onProgress?.({ phase: 'build', fraction: 0.99, message: 'Saving searchable PDF…' })
  const bytes = await outDoc.save()
  onProgress?.({ phase: 'build', fraction: 1, message: 'Done' })

  return {
    bytes,
    fileName: outName,
    pagesOcred: pagesToOcr.length,
    pagesSkipped: numPages - pagesToOcr.length,
    charsAdded,
  }
}
