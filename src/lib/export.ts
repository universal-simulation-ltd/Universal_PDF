import { PDFDocument, StandardFonts, LineCapStyle, degrees } from 'pdf-lib'
import type { Annotation, RedactAnnotation } from '../types/annotations'
import type { FormFieldValue } from '../stores/formStore'
import { hexToPdfRgb } from './colors'
import { pdfjsLib, type PDFDocumentProxy } from './pdfjs'

// Rotate (x, y) around (cx, cy) by `rad` radians.
function rotatePoint(x: number, y: number, cx: number, cy: number, rad: number): [number, number] {
  if (rad === 0) return [x, y]
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = x - cx
  const dy = y - cy
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]
}

// Codepoints WinAnsi (cp1252) can represent in addition to ASCII (0x20-0x7E)
// and Latin-1 supplement (0xA0-0xFF). Anything outside this set blows up
// pdf-lib's standard fonts on encode — we replace it with '?' so a stray
// glyph doesn't kill the whole export.
const WIN_ANSI_EXTRAS = new Set([
  0x20AC, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6,
  0x2030, 0x0160, 0x2039, 0x0152, 0x017D, 0x2018, 0x2019, 0x201C,
  0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A,
  0x0153, 0x017E, 0x0178
])
function sanitizeForWinAnsi(text: string): string {
  let out = ''
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    if ((cp >= 0x20 && cp <= 0x7E) || (cp >= 0xA0 && cp <= 0xFF) || WIN_ANSI_EXTRAS.has(cp)) {
      out += ch
    } else {
      out += '?'
    }
  }
  return out
}

// Convert a polyline (flat [x0,y0,x1,y1,...]) to a sequence of cardinal-spline
// Bezier segments matching Konva's `tension` smoothing on the screen overlay.
function smoothPolyline(points: number[], tension = 0.4, samplesPerSeg = 12) {
  if (points.length < 4) return points
  const out: Array<[number, number]> = []
  out.push([points[0], points[1]])
  for (let i = 0; i < points.length - 2; i += 2) {
    const p1x = points[i]
    const p1y = points[i + 1]
    const p2x = points[i + 2]
    const p2y = points[i + 3]
    const p0x = i === 0 ? p1x : points[i - 2]
    const p0y = i === 0 ? p1y : points[i - 1]
    const p3x = i + 4 >= points.length ? p2x : points[i + 4]
    const p3y = i + 4 >= points.length ? p2y : points[i + 5]
    const cp1x = p1x + ((p2x - p0x) * tension) / 6
    const cp1y = p1y + ((p2y - p0y) * tension) / 6
    const cp2x = p2x - ((p3x - p1x) * tension) / 6
    const cp2y = p2y - ((p3y - p1y) * tension) / 6
    for (let s = 1; s <= samplesPerSeg; s++) {
      const t = s / samplesPerSeg
      const mt = 1 - t
      const x =
        mt * mt * mt * p1x +
        3 * mt * mt * t * cp1x +
        3 * mt * t * t * cp2x +
        t * t * t * p2x
      const y =
        mt * mt * mt * p1y +
        3 * mt * mt * t * cp1y +
        3 * mt * t * t * cp2y +
        t * t * t * p2y
      out.push([x, y])
    }
  }
  return out.flat()
}

// Render one source page through pdfjs at high DPI, paint each redact rect
// black on the resulting canvas, then return the JPEG bytes. The redact
// coordinates come from the editor's canvas space (at `annotationScale`)
// and are mapped to the render canvas via the ratio.
async function rasterizePageWithRedacts(
  pdfjsDoc: PDFDocumentProxy,
  pageIndex: number,
  redacts: RedactAnnotation[],
  annotationScale: number
): Promise<Uint8Array> {
  const page = await pdfjsDoc.getPage(pageIndex + 1)
  const renderScale = 2
  const viewport = page.getViewport({ scale: renderScale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  await page.render({ canvasContext: ctx, viewport }).promise

  const k = renderScale / annotationScale
  ctx.fillStyle = '#000000'
  for (const r of redacts) {
    ctx.fillRect(r.x * k, r.y * k, r.width * k, r.height * k)
  }

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/jpeg',
      0.92
    )
  })
  return new Uint8Array(await blob.arrayBuffer())
}

export async function buildAnnotatedPdfBytes(
  sourceBytes: ArrayBuffer,
  annotations: Annotation[],
  scale: number,
  formValues?: FormFieldValue[]
): Promise<Uint8Array> {
  const sourcePdf = await PDFDocument.load(sourceBytes)

  // Fill PDF form fields if any. Flatten so values bake into the page
  // content streams — that way any redacted page rasterizes with the user's
  // typed values baked in, and copyPages preserves them on other pages too.
  if (formValues && formValues.length > 0) {
    try {
      const form = sourcePdf.getForm()
      for (const fv of formValues) {
        if (!fv.value) continue
        try {
          const field = form.getTextField(fv.fieldName)
          field.setText(fv.value)
        } catch {
          // Field not found or not a text field — skip silently
        }
      }
      try { form.flatten() } catch { /* ignore if form can't be flattened */ }
    } catch {
      // No form fields or form not supported
    }
  }

  // Group redact annotations by page — these drive the rasterize-and-rebuild
  // pass below.
  const redactsByPage = new Map<number, RedactAnnotation[]>()
  for (const a of annotations) {
    if (a.type === 'redact') {
      if (!redactsByPage.has(a.pageIndex)) redactsByPage.set(a.pageIndex, [])
      redactsByPage.get(a.pageIndex)!.push(a)
    }
  }

  // If any page needs redaction, rebuild the document so redacted pages
  // become flat raster images (no original text/forms survive in the
  // content stream). Pages without redacts are copied across unchanged.
  let pdf: PDFDocument
  if (redactsByPage.size > 0) {
    const flatBytes = await sourcePdf.save()
    const pdfjsDoc = await pdfjsLib.getDocument({ data: flatBytes.slice() }).promise

    const out = await PDFDocument.create()
    for (let i = 0; i < sourcePdf.getPageCount(); i++) {
      const srcPage = sourcePdf.getPage(i)
      const { width, height } = srcPage.getSize()
      if (redactsByPage.has(i)) {
        const imgBytes = await rasterizePageWithRedacts(
          pdfjsDoc,
          i,
          redactsByPage.get(i)!,
          scale
        )
        const img = await out.embedJpg(imgBytes)
        const newPage = out.addPage([width, height])
        newPage.drawImage(img, { x: 0, y: 0, width, height })
      } else {
        const [copied] = await out.copyPages(sourcePdf, [i])
        out.addPage(copied)
      }
    }
    pdf = out
  } else {
    pdf = sourcePdf
  }

  const fontSans = await pdf.embedFont(StandardFonts.Helvetica)
  const fontSerif = await pdf.embedFont(StandardFonts.TimesRoman)
  const fontMono = await pdf.embedFont(StandardFonts.Courier)
  const pickFont = (fam?: 'sans' | 'serif' | 'mono') =>
    fam === 'serif' ? fontSerif : fam === 'mono' ? fontMono : fontSans
  const pages = pdf.getPages()

  const byPage = new Map<number, Annotation[]>()
  for (const a of annotations) {
    if (a.type === 'redact') continue
    if (!byPage.has(a.pageIndex)) byPage.set(a.pageIndex, [])
    byPage.get(a.pageIndex)!.push(a)
  }

  for (const [pageIndex, items] of byPage) {
    const page = pages[pageIndex]
    if (!page) continue
    // PDF.js's viewport (used for the on-screen canvas) is anchored at the
    // page's CropBox origin, not at user-space (0, 0). When a PDF declares
    // a non-zero CropBox/MediaBox origin, every annotation we draw with
    // pdf-lib would otherwise be shifted by that offset against the
    // rasterized page — the form fields stay put because pdf-lib's
    // flatten() works in user-space already.
    const box = page.getCropBox()
    const ph = box.height
    const ox = box.x
    const oy = box.y
    // sx/toY map a canvas-space position to PDF user-space (offset included).
    // sw maps a canvas-space size — width, height, font size — to PDF
    // user-space (scale only, no offset).
    const sx = (n: number) => ox + n / scale
    const toY = (canvasY: number) => oy + ph - canvasY / scale
    const sw = (n: number) => n / scale

    for (const a of items) {
      switch (a.type) {
        case 'text': {
          const rot = a.rotation ?? 0
          const rad = (rot * Math.PI) / 180
          const body = sanitizeForWinAnsi(a.text)
          if (body) {
            const blKx = a.x
            const blKy = a.y + a.fontSize * 0.8
            const [bx, by] = rotatePoint(blKx, blKy, a.x, a.y, rad)
            page.drawText(body, {
              x: sx(bx),
              y: toY(by),
              size: sw(a.fontSize),
              font: pickFont(a.fontFamily),
              color: hexToPdfRgb(a.color),
              rotate: rot ? degrees(-rot) : undefined
            })
          }
          break
        }
        case 'rect': {
          const rot = a.rotation ?? 0
          const rad = (rot * Math.PI) / 180
          // Konva top-left is (a.x, a.y); pdf-lib wants the bottom-left of
          // the un-rotated rectangle in its own coordinate system.
          const [bx, by] = rotatePoint(a.x, a.y + a.height, a.x, a.y, rad)
          if (a.filled) {
            page.drawRectangle({
              x: sx(bx),
              y: toY(by),
              width: sw(a.width),
              height: sw(a.height),
              color: hexToPdfRgb(a.color),
              rotate: rot ? degrees(-rot) : undefined
            })
          } else {
            page.drawRectangle({
              x: sx(bx),
              y: toY(by),
              width: sw(a.width),
              height: sw(a.height),
              borderColor: hexToPdfRgb(a.color),
              borderWidth: sw(2),
              opacity: 0,
              rotate: rot ? degrees(-rot) : undefined
            })
          }
          break
        }
        case 'ellipse': {
          const rot = a.rotation ?? 0
          // pdf-lib drawEllipse is centre-anchored. Konva stores a top-left
          // bbox; the centre in Konva space is (x + w/2, y + h/2). Rotation in
          // the app pivots around the bbox top-left, so rotate that centre
          // about the top-left to get the centre in the rotated frame.
          const rad = (rot * Math.PI) / 180
          const [cxr, cyr] = rotatePoint(a.x + a.width / 2, a.y + a.height / 2, a.x, a.y, rad)
          const common = {
            x: sx(cxr),
            y: toY(cyr),
            xScale: sw(a.width / 2),
            yScale: sw(a.height / 2),
            rotate: rot ? degrees(-rot) : undefined
          }
          if (a.filled) {
            page.drawEllipse({ ...common, color: hexToPdfRgb(a.color) })
          } else {
            page.drawEllipse({
              ...common,
              borderColor: hexToPdfRgb(a.color),
              borderWidth: sw(2),
              opacity: 0
            })
          }
          break
        }
        case 'draw': {
          const pts = smoothPolyline(a.points, 0.4, 12)
          for (let i = 0; i < pts.length - 2; i += 2) {
            page.drawLine({
              start: { x: sx(pts[i]), y: toY(pts[i + 1]) },
              end: { x: sx(pts[i + 2]), y: toY(pts[i + 3]) },
              thickness: sw(a.strokeWidth),
              color: hexToPdfRgb(a.color),
              opacity: a.opacity,
              lineCap: LineCapStyle.Round
            })
          }
          break
        }
        case 'tick': {
          const s = a.size
          const rad = ((a.rotation ?? 0) * Math.PI) / 180
          const segs: Array<[number, number, number, number]> = [
            [a.x, a.y + s * 0.55, a.x + s * 0.35, a.y + s * 0.9],
            [a.x + s * 0.35, a.y + s * 0.9, a.x + s, a.y + s * 0.1]
          ]
          for (const [x1, y1, x2, y2] of segs) {
            const [rx1, ry1] = rotatePoint(x1, y1, a.x, a.y, rad)
            const [rx2, ry2] = rotatePoint(x2, y2, a.x, a.y, rad)
            page.drawLine({
              start: { x: sx(rx1), y: toY(ry1) },
              end: { x: sx(rx2), y: toY(ry2) },
              thickness: sw(3.5),
              color: hexToPdfRgb(a.color),
              lineCap: LineCapStyle.Round
            })
          }
          break
        }
        case 'cross': {
          const s = a.size
          const rad = ((a.rotation ?? 0) * Math.PI) / 180
          const segs: Array<[number, number, number, number]> = [
            [a.x, a.y, a.x + s, a.y + s],
            [a.x + s, a.y, a.x, a.y + s]
          ]
          for (const [x1, y1, x2, y2] of segs) {
            const [rx1, ry1] = rotatePoint(x1, y1, a.x, a.y, rad)
            const [rx2, ry2] = rotatePoint(x2, y2, a.x, a.y, rad)
            page.drawLine({
              start: { x: sx(rx1), y: toY(ry1) },
              end: { x: sx(rx2), y: toY(ry2) },
              thickness: sw(3.5),
              color: hexToPdfRgb(a.color),
              lineCap: LineCapStyle.Round
            })
          }
          break
        }
        case 'image': {
          const rot = a.rotation ?? 0
          const rad = (rot * Math.PI) / 180
          const isPng = a.src.startsWith('data:image/png')
          const img = isPng
            ? await pdf.embedPng(a.src)
            : await pdf.embedJpg(a.src)
          const [bx, by] = rotatePoint(a.x, a.y + a.height, a.x, a.y, rad)
          page.drawImage(img, {
            x: sx(bx),
            y: toY(by),
            width: sw(a.width),
            height: sw(a.height),
            rotate: rot ? degrees(-rot) : undefined
          })
          break
        }
      }
    }
  }

  return pdf.save()
}

export function downloadPdfBytes(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function exportPdfWithAnnotations(
  sourceBytes: ArrayBuffer,
  annotations: Annotation[],
  scale: number,
  fileName: string,
  formValues?: FormFieldValue[]
) {
  const bytes = await buildAnnotatedPdfBytes(sourceBytes, annotations, scale, formValues)
  const outName = fileName.replace(/\.pdf$/i, '') + '-pdf.pdf'
  downloadPdfBytes(bytes, outName)
}

// 'light' keeps everything lossless (text stays selectable) and just re-packs
// the file with object streams. 'balanced' and 'strong' rasterize each page to
// JPEG — losing text selectability but shrinking image-heavy PDFs a lot — with
// progressively lower render resolution and JPEG quality.
export type CompressQuality = 'light' | 'balanced' | 'strong'

const RASTER_SETTINGS: Record<'balanced' | 'strong', { renderScale: number; jpegQuality: number }> = {
  balanced: { renderScale: 1.5, jpegQuality: 0.7 },
  strong: { renderScale: 1.0, jpegQuality: 0.45 }
}

export interface CompressResult {
  bytes: Uint8Array
  originalSize: number
  compressedSize: number
  fileName: string
  quality: CompressQuality
}

// Render one source page through pdfjs at the given DPI and return JPEG bytes.
async function rasterizePageToJpeg(
  pdfjsDoc: PDFDocumentProxy,
  pageIndex: number,
  renderScale: number,
  jpegQuality: number
): Promise<Uint8Array> {
  const page = await pdfjsDoc.getPage(pageIndex + 1)
  const viewport = page.getViewport({ scale: renderScale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  // JPEG has no alpha — paint white first so transparent regions don't go black.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/jpeg',
      jpegQuality
    )
  })
  return new Uint8Array(await blob.arrayBuffer())
}

export async function compressPdf(
  sourceBytes: ArrayBuffer,
  fileName: string,
  quality: CompressQuality = 'light'
): Promise<CompressResult> {
  const originalSize = sourceBytes.byteLength
  const outName = fileName.replace(/\.pdf$/i, '') + '-compressed.pdf'

  if (quality === 'light') {
    const pdf = await PDFDocument.load(sourceBytes)
    const bytes = await pdf.save({ useObjectStreams: true })
    return { bytes, originalSize, compressedSize: bytes.byteLength, fileName: outName, quality }
  }

  const { renderScale, jpegQuality } = RASTER_SETTINGS[quality]
  // pdfjs detaches the buffer it's handed, so give it a copy and keep the
  // original for pdf-lib (which we use only to read each page's size).
  const pdfjsDoc = await pdfjsLib.getDocument({ data: sourceBytes.slice(0) }).promise
  const srcPdf = await PDFDocument.load(sourceBytes)
  const out = await PDFDocument.create()
  for (let i = 0; i < srcPdf.getPageCount(); i++) {
    const { width, height } = srcPdf.getPage(i).getSize()
    const imgBytes = await rasterizePageToJpeg(pdfjsDoc, i, renderScale, jpegQuality)
    const img = await out.embedJpg(imgBytes)
    const page = out.addPage([width, height])
    page.drawImage(img, { x: 0, y: 0, width, height })
  }
  const bytes = await out.save({ useObjectStreams: true })
  return { bytes, originalSize, compressedSize: bytes.byteLength, fileName: outName, quality }
}
