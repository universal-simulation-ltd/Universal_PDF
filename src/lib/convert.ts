import { PDFDocument } from 'pdf-lib'
import { pdfjsLib } from './pdfjs'
import type { ZipEntry } from './zip'

// Merge / convert helpers. Everything here runs on-device — pdf-lib rebuilds
// documents in memory and pdfjs rasterizes pages to canvases, so no bytes ever
// leave the browser. These mirror the "bytes in → bytes out" shape of
// compressPdf/buildAnnotatedPdfBytes in export.ts.

// ── Merge ────────────────────────────────────────────────────────────────────

// Concatenate several PDFs into one, in the order given. copyPages preserves
// each page's resources, annotations and form widgets, so pages arrive intact.
export async function mergePdfs(sources: ArrayBuffer[]): Promise<Uint8Array> {
  if (sources.length === 0) throw new Error('No PDFs to merge')
  const out = await PDFDocument.create()
  for (const bytes of sources) {
    const src = await PDFDocument.load(bytes)
    const copied = await out.copyPages(src, src.getPageIndices())
    for (const page of copied) out.addPage(page)
  }
  return out.save({ useObjectStreams: true })
}

// ── PDF → images ─────────────────────────────────────────────────────────────

export type ImageFormat = 'png' | 'jpeg'

// Render one pdfjs page to a canvas at `scale`x device resolution and return the
// encoded bytes. JPEG has no alpha, so we paint white behind it first (matching
// rasterizePageToJpeg in export.ts) — otherwise transparent regions go black.
async function renderPageToImage(
  pdfjsDoc: Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>,
  pageIndex: number,
  format: ImageFormat,
  scale: number,
  jpegQuality: number
): Promise<Uint8Array> {
  const page = await pdfjsDoc.getPage(pageIndex + 1)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  if (format === 'jpeg') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  await page.render({ canvasContext: ctx, viewport }).promise
  const mime = format === 'png' ? 'image/png' : 'image/jpeg'
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      mime,
      format === 'jpeg' ? jpegQuality : undefined
    )
  })
  return new Uint8Array(await blob.arrayBuffer())
}

export interface PdfToImagesOptions {
  format?: ImageFormat
  /** Device-pixel scale — 2 ≈ 144dpi, good balance of sharpness and size. */
  scale?: number
  jpegQuality?: number
  /** Called after each page renders, for progress UI (1-based). */
  onProgress?: (done: number, total: number) => void
}

// Rasterize every page of a PDF to an image, returned as ZIP entries. The
// caller decides whether to zip them (multi-page) or download the single entry
// directly. Names are 1-based and zero-padded so they sort naturally.
export async function pdfToImages(
  sourceBytes: ArrayBuffer,
  baseName: string,
  opts: PdfToImagesOptions = {}
): Promise<ZipEntry[]> {
  const { format = 'png', scale = 2, jpegQuality = 0.92, onProgress } = opts
  // pdfjs detaches the buffer it's handed, so give it a copy.
  const pdfjsDoc = await pdfjsLib.getDocument({ data: sourceBytes.slice(0) }).promise
  const total = pdfjsDoc.numPages
  const ext = format === 'png' ? 'png' : 'jpg'
  const stem = baseName.replace(/\.pdf$/i, '')
  const pad = String(total).length
  const entries: ZipEntry[] = []
  for (let i = 0; i < total; i++) {
    const data = await renderPageToImage(pdfjsDoc, i, format, scale, jpegQuality)
    const suffix = total > 1 ? `-${String(i + 1).padStart(pad, '0')}` : ''
    entries.push({ name: `${stem}${suffix}.${ext}`, data })
    onProgress?.(i + 1, total)
  }
  return entries
}

// ── Images → PDF ─────────────────────────────────────────────────────────────

// Decode an image file to raw RGBA + dimensions via a canvas. Used to normalize
// formats pdf-lib can't embed natively (WebP, GIF, BMP…) into PNG bytes.
async function fileToPngBytes(file: File): Promise<Uint8Array> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error(`Could not decode ${file.name}`))
      el.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    ctx.drawImage(img, 0, 0)
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
    })
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Build a PDF with one page per image, each page sized to its image's native
// pixel dimensions (1px → 1pt). JPEGs and PNGs embed directly (lossless
// pass-through of the original bytes); anything else is normalized to PNG first
// so it can be embedded at all.
export async function imagesToPdf(files: File[]): Promise<Uint8Array> {
  if (files.length === 0) throw new Error('No images to convert')
  const out = await PDFDocument.create()
  for (const file of files) {
    const isJpeg = /\.jpe?g$/i.test(file.name) || file.type === 'image/jpeg'
    const isPng = /\.png$/i.test(file.name) || file.type === 'image/png'
    let img
    if (isJpeg) {
      img = await out.embedJpg(new Uint8Array(await file.arrayBuffer()))
    } else if (isPng) {
      img = await out.embedPng(new Uint8Array(await file.arrayBuffer()))
    } else {
      img = await out.embedPng(await fileToPngBytes(file))
    }
    const page = out.addPage([img.width, img.height])
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
  }
  return out.save({ useObjectStreams: true })
}
