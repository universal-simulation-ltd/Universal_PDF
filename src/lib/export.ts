import {
  PDFDocument, StandardFonts, LineCapStyle, degrees, PDFName, PDFHexString, PDFString, PDFArray, PDFDict, PDFStream,
  PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList,
  PDFAcroSignature, PDFRef, PDFNumber,
  pushGraphicsState, popGraphicsState, concatTransformationMatrix, drawRectangle, drawText,
  type PDFFont, type PDFImage, type PDFPage, type PDFAcroField
} from 'pdf-lib'
import type { Annotation, RedactAnnotation, SignatureFieldAnnotation } from '../types/annotations'
import type { FormFieldValue } from '../stores/formStore'
import { hexToPdfRgb } from './colors'
import { fontBase, type PdfBaseFont } from './fonts'
import { LINE_HEIGHT, layoutText } from './textLayout'
import { runUnderlined } from './textRuns'
import { openPdf, type PDFDocumentProxy } from './pdfjs'
import { redactFillHex } from './redactGate'
import { safeLinkUrl } from './links'
import { downloadPdfBytes } from './download'
import { getT } from '../i18n'
import { loadFallbackFont } from './fallbackFont'
import { uprightJpeg } from './jpegOrientation'

// ⚠️ LEGACY. Exports before 2026-10-12 carried the unsigned "Sign here" boxes
// as JSON under this custom catalog key, with the outline and caption baked
// into the page — so only Universal PDF could find them. It is still READ, so
// those files keep their boxes, but no longer written: a box is now a real
// PDF signature field (see `addSignatureFields`), which Acrobat, Preview and
// any other reader can sign too.
const SIG_FIELDS_KEY = 'UPDFSigFields'

// The legacy key's per-box shape. Coordinates are PDF points (the annotation
// store's native space — see EXPORT_SCALE = 1).
type EmbeddedSigField = Pick<
  SignatureFieldAnnotation,
  | 'id'
  | 'pageIndex'
  | 'x'
  | 'y'
  | 'width'
  | 'height'
  | 'requireName'
  | 'requireDate'
  | 'requireLive'
>

// Private key on a signature field Universal PDF wrote: which extra lines the
// box asks for (/Name /Date /Live; an empty array asks for none). Readers that
// do not know it ignore it, as the PDF standard requires. Its PRESENCE is also
// how a reopened field is known to be ours, with its outline and caption
// already in its own appearance — see `fromField` on the annotation.
const SIG_REQUIRE_KEY = 'UPDFRequire'

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
// The standard fonts carry Latin-1 only. A letter outside it (Turkish ş ğ ı İ,
// Polish ł, Czech č …) keeps its base letter rather than becoming "?" — the
// translated "Sign here" label drawn into the PDF is one place that needs it.
const FOLD: Record<string, string> = { ı: 'i', İ: 'I', ł: 'l', Ł: 'L', đ: 'd', Đ: 'D', ħ: 'h', Ħ: 'H' }
function foldToLatin1(ch: string): string {
  if (FOLD[ch]) return FOLD[ch]
  const base = ch.normalize('NFD')[0]
  const cp = base.codePointAt(0)!
  return base !== ch && ((cp >= 0x20 && cp <= 0x7E) || (cp >= 0xA0 && cp <= 0xFF)) ? base : '?'
}
function sanitizeForWinAnsi(text: string): string {
  let out = ''
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    if ((cp >= 0x20 && cp <= 0x7E) || (cp >= 0xA0 && cp <= 0xFF) || WIN_ANSI_EXTRAS.has(cp)) {
      out += ch
    } else {
      out += foldToLatin1(ch)
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

// ── Page geometry ──────────────────────────────────────────────────────────
// Every annotation is stored in the space the reader SAW: pdf.js's viewport at
// scale 1, which is the page's CropBox, turned by its /Rotate, with y running
// down from the top-left of what was on screen. pdf-lib draws in the page's
// own user space, which is none of those things on a rotated or cropped page.
//
// ⚠️ This used to be bridged with an origin offset alone, which is right only
// for an unrotated page. On a `/Rotate 90` page — phone scans, landscape
// exports — a signature placed at the top-left came out at the top-right edge,
// turned on its side, and anything placed beyond the page's unrotated width
// fell off the page. So instead each page gets ONE matrix from "view space"
// (the reader's view, y up, origin at its bottom-left, in points) to user
// space, applied with `cm` around everything drawn on it. The drawing code
// below then only ever thinks in the reader's view, rotation or not.
type Matrix = [number, number, number, number, number, number]

interface PageFrame {
  /** The reader's view of the page, in points. */
  width: number
  height: number
  /** View space → the page's user space. */
  m: Matrix
}

function pageFrame(page: PDFPage): PageFrame {
  const { x, y, width: w, height: h } = page.getCropBox()
  // pdf.js accepts only multiples of 90 and treats anything else as 0.
  const angle = page.getRotation().angle
  const r = angle % 90 === 0 ? ((angle % 360) + 360) % 360 : 0
  switch (r) {
    case 90:
      return { width: h, height: w, m: [0, 1, -1, 0, x + w, y] }
    case 180:
      return { width: w, height: h, m: [-1, 0, 0, -1, x + w, y + h] }
    case 270:
      return { width: h, height: w, m: [0, -1, 1, 0, x, y + h] }
    default:
      return { width: w, height: h, m: [1, 0, 0, 1, x, y] }
  }
}

function applyMatrix(m: Matrix, vx: number, vy: number): [number, number] {
  return [m[0] * vx + m[2] * vy + m[4], m[1] * vx + m[3] * vy + m[5]]
}

// ── Fonts ──────────────────────────────────────────────────────────────────
const isWinAnsi = (cp: number) =>
  (cp >= 0x20 && cp <= 0x7E) || (cp >= 0xA0 && cp <= 0xFF) || WIN_ANSI_EXTRAS.has(cp)

function fitsWinAnsi(text: string): boolean {
  for (const ch of text) if (!isWinAnsi(ch.codePointAt(0)!)) return false
  return true
}

// Standard-14 variants for each base family, indexed [normal, bold, italic,
// boldItalic]. Text annotations map to their nearest base (see fonts.ts) and
// then to the bold/italic variant for the on-screen toggles.
const STD_VARIANTS: Record<PdfBaseFont, [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  times: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  courier: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique]
}

/**
 * The fonts one output document draws text in.
 *
 * Text the standard fonts can spell (WinAnsi — Western European) uses them, as
 * it always has: they cost nothing, because they carry no glyph data. Anything
 * else is drawn in Liberation Sans, embedded as a subset — the face the Word
 * import already falls back to (lib/fallbackFont.ts), which covers Turkish,
 * Polish and the rest of Latin Extended, Greek and Cyrillic.
 *
 * ⚠️ WHY: the app ships in Turkish, and the standard fonts cannot write ş, ğ or
 * ı. Typed into a FORM FIELD they made every export fail — pdf-lib throws while
 * building the field's appearance, and the value is auto-saved, so it failed
 * again on every retry. In a text box they were quietly folded (ı → i, ş → s),
 * which in Turkish can change what a word means.
 *
 * The fallback has one weight and no italic, and it is a sans: a Times or bold
 * run that needs it comes out as regular sans. That is the trade for not
 * shipping a family of faces; the letters are right, which is the point. If the
 * font cannot be had (offline on first use) the old folding is the answer, never
 * a failed export.
 */
class ExportFonts {
  private std = new Map<StandardFonts, PDFFont>()
  private fallback: Promise<{ font: PDFFont; chars: Set<number> } | null> | null = null

  constructor(private pdf: PDFDocument) {}

  async standard(base: PdfBaseFont, bold?: boolean, italic?: boolean): Promise<PDFFont> {
    const std = STD_VARIANTS[base][bold && italic ? 3 : bold ? 1 : italic ? 2 : 0]
    let f = this.std.get(std)
    if (!f) {
      f = await this.pdf.embedFont(std)
      this.std.set(std, f)
    }
    return f
  }

  private loadFallback() {
    this.fallback ??= (async () => {
      const bytes = await loadFallbackFont()
      if (!bytes) return null
      // Loaded on demand: fontkit is a few hundred KB that an all-Latin export
      // never needs.
      const { default: fontkit } = await import('@pdf-lib/fontkit')
      this.pdf.registerFontkit(fontkit)
      const font = await this.pdf.embedFont(bytes, { subset: true })
      return { font, chars: new Set(font.getCharacterSet()) }
    })().catch(() => null)
    return this.fallback
  }

  /** The font to draw `text` in, and `text` as that font can spell it. */
  async forText(text: string, base: PdfBaseFont, bold?: boolean, italic?: boolean): Promise<{ font: PDFFont; text: string }> {
    if (fitsWinAnsi(text)) return { font: await this.standard(base, bold, italic), text }
    const fb = await this.loadFallback()
    if (!fb) return { font: await this.standard(base, bold, italic), text: sanitizeForWinAnsi(text) }
    let out = ''
    for (const ch of text) out += fb.chars.has(ch.codePointAt(0)!) ? ch : foldToLatin1(ch)
    return { font: fb.font, text: out }
  }

  /** For a form field: null means "the field's own font will do". */
  async forField(text: string): Promise<{ font: PDFFont | null; text: string }> {
    if (fitsWinAnsi(text.replace(/[\r\n]/g, ''))) return { font: null, text }
    const fb = await this.loadFallback()
    if (!fb) return { font: null, text: text.split(/(\r?\n)/).map((s) => (/\r?\n/.test(s) ? s : sanitizeForWinAnsi(s))).join('') }
    let out = ''
    for (const ch of text) out += ch === '\n' || ch === '\r' || fb.chars.has(ch.codePointAt(0)!) ? ch : foldToLatin1(ch)
    return { font: fb.font, text: out }
  }
}

// ── Pictures ───────────────────────────────────────────────────────────────
/**
 * Embed a placed picture or signature, whatever format it arrived in.
 *
 * ⚠️ pdf-lib takes PNG and JPEG only, and the picture button accepts WebP and
 * GIF too — which used to go to `embedJpg` and fail the whole export with "SOI
 * not found". Anything that is not PNG or JPEG BY ITS BYTES (a data URL's label
 * is not trusted) is redrawn to PNG through a canvas first; a GIF keeps its
 * first frame, as it would printed.
 */
class ExportImages {
  private cache = new Map<string, Promise<PDFImage>>()
  constructor(private pdf: PDFDocument) {}

  embed(src: string): Promise<PDFImage> {
    let hit = this.cache.get(src)
    if (!hit) {
      hit = this.load(src)
      this.cache.set(src, hit)
    }
    return hit
  }

  private async load(src: string): Promise<PDFImage> {
    const bytes = await imageBytes(src)
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return this.pdf.embedPng(bytes)
    // A phone photo's EXIF turn is applied on screen but not by embedJpg — see jpegOrientation.ts.
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return this.pdf.embedJpg(await uprightJpeg(bytes))
    return this.pdf.embedPng(await redrawAsPng(bytes))
  }
}

async function imageBytes(src: string): Promise<Uint8Array> {
  const m = /^data:[^,]*?(;base64)?,(.*)$/s.exec(src)
  if (!m) return new Uint8Array(await (await fetch(src)).arrayBuffer())
  if (!m[1]) return new TextEncoder().encode(decodeURIComponent(m[2]))
  const bin = atob(m[2])
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function redrawAsPng(bytes: Uint8Array): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart]))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    ctx.drawImage(img, 0, 0)
    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
    )
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}

// ── Forms ──────────────────────────────────────────────────────────────────
/**
 * Write the reader's form entries into the document's fields, then flatten so
 * they are baked into the page content — which is what lets a redacted page
 * rasterise with them in, and copyPages carry them on every other page.
 *
 * Every entry that EXISTS is applied, including an empty one: the store only
 * holds fields the reader actually touched, so an empty value is somebody
 * clearing a field the PDF arrived with filled in, and skipping it (as this
 * once did) silently put the old value back.
 */
async function fillForm(pdf: PDFDocument, formValues: FormFieldValue[], fonts: ExportFonts) {
  let form
  try {
    form = pdf.getForm()
  } catch {
    return // no AcroForm worth the name
  }
  for (const fv of formValues) {
    let field
    try {
      field = form.getField(fv.fieldName)
    } catch {
      continue // not in this document's form (renamed, or a stale entry)
    }
    const value = fv.value
    const off = !value || value === 'Off'
    try {
      if (field instanceof PDFTextField) {
        const { font, text } = await fonts.forField(value)
        field.setText(text || undefined)
        // The field's own (standard) font cannot spell this — and pdf-lib would
        // throw building its appearance at flatten time, failing the export.
        if (font) field.updateAppearances(font)
      } else if (field instanceof PDFCheckBox) {
        if (off) field.uncheck()
        else field.check()
      } else if (field instanceof PDFRadioGroup) {
        if (off) field.clear()
        else selectRadio(field, value)
      } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
        if (!value) field.clear()
        else field.select(choiceDisplay(field, value))
      }
    } catch {
      // A value this field will not take (an option that no longer exists, a
      // read-only field) leaves the field as the PDF had it.
    }
  }
  try { form.flatten() } catch { /* ignore if form can't be flattened */ }
}

// The viewer stores what pdf.js reports for a radio widget: its "on" state
// name. pdf-lib's `select` checks against the field's /Opt export values when
// there are any, which differ from those names in some forms — so fall back
// to setting the state name directly.
function selectRadio(field: PDFRadioGroup, value: string) {
  try {
    field.select(value)
  } catch {
    field.acroField.setValue(PDFName.of(value))
  }
}

// The viewer stores a choice's EXPORT value; pdf-lib selects by what the option
// displays. Map one to the other where the PDF gives both.
function choiceDisplay(field: PDFDropdown | PDFOptionList, exportValue: string): string {
  for (const { value, display } of field.acroField.getOptions()) {
    if (value.decodeText() === exportValue) return (display ?? value).decodeText()
  }
  return exportValue
}

// ── Drawing ────────────────────────────────────────────────────────────────
/** A clickable link, in canvas space, added once the pages are final. */
interface PendingLink {
  pageIndex: number
  x1: number
  y1: number
  x2: number
  y2: number
  uri: string
}

/**
 * Draw annotations onto `pdf`'s pages, each in its page's view space (see
 * PageFrame). Links are not added here but collected in `links`: a page drawn
 * on now may yet be rasterised for redaction, which would drop them.
 */
async function drawAnnotations(
  pdf: PDFDocument,
  annotations: Annotation[],
  scale: number,
  links: PendingLink[]
) {
  const fonts = new ExportFonts(pdf)
  const images = new ExportImages(pdf)
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
    const frame = pageFrame(page)
    // sx/toY map a canvas-space position to view space; sw maps a canvas-space
    // size — width, height, font size — to points.
    const sx = (n: number) => n / scale
    const toY = (canvasY: number) => frame.height - canvasY / scale
    const sw = (n: number) => n / scale

    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...frame.m))
    try {
      for (const a of items) {
        switch (a.type) {
          case 'text': {
            const rot = a.rotation ?? 0
            const rad = (rot * Math.PI) / 180
            // Draw each styled run in sequence, advancing x by the run's own
            // (variant-specific) width so mixed bold/italic/underline/link within
            // one text box bake correctly.
            //
            // ⚠️ WHERE the lines break is decided by the shared canvas layout, not
            // re-derived here from pdf-lib's metrics: the two measure slightly
            // differently, and a file whose words wrapped somewhere other than
            // the editor showed them would be the bug. Only the advance WITHIN a
            // line uses the embedded font's own widths, as it always has.
            for (const [li, line] of layoutText(a).entries()) {
              const lineY = a.y + li * a.fontSize * LINE_HEIGHT
              let offset = 0 // canvas-space advance from a.x
              for (const run of line.runs) {
                const { font, text: body } = await fonts.forText(run.text, fontBase(a.fontFamily), run.bold, run.italic)
                const runW = body ? font.widthOfTextAtSize(body, a.fontSize) : 0
                if (body) {
                  const rx = a.x + offset
                  const blKy = lineY + a.fontSize * 0.8
                  const [bx, by] = rotatePoint(rx, blKy, a.x, a.y, rad)
                  page.drawText(body, {
                    x: sx(bx),
                    y: toY(by),
                    size: sw(a.fontSize),
                    font,
                    color: hexToPdfRgb(a.color),
                    rotate: rot ? degrees(-rot) : undefined
                  })
                  // pdf-lib has no underline; a link also shows as an underline (its
                  // colour is deliberately left as the text colour). Draw the rule
                  // just below the baseline, rotated with the text. The canvas and
                  // the editor draw a link the same way — see runUnderlined.
                  if (runUnderlined(run)) {
                    const uy = lineY + a.fontSize * 0.98
                    const [ux1, uy1] = rotatePoint(rx, uy, a.x, a.y, rad)
                    const [ux2, uy2] = rotatePoint(rx + runW, uy, a.x, a.y, rad)
                    page.drawLine({
                      start: { x: sx(ux1), y: toY(uy1) },
                      end: { x: sx(ux2), y: toY(uy2) },
                      thickness: sw(Math.max(0.75, a.fontSize * 0.06)),
                      color: hexToPdfRgb(a.color)
                    })
                  }
                  // A clickable URI link over just this run's box. The rect is
                  // axis-aligned (run rotation of the hit area is dropped —
                  // acceptable for a link target).
                  // Through `safeLinkUrl` again: an annotation saved before
                  // links were checked on entry may still carry a relative or
                  // script URL, and it must not be written into the file.
                  const uri = run.link ? safeLinkUrl(run.link) : null
                  if (uri) {
                    links.push({ pageIndex, x1: rx, y1: lineY, x2: rx + runW, y2: lineY + a.fontSize * 1.2, uri })
                  }
                }
                offset += runW
              }
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
            const img = await images.embed(a.src)
            const [bx, by] = rotatePoint(a.x, a.y + a.height, a.x, a.y, rad)
            page.drawImage(img, {
              x: sx(bx),
              y: toY(by),
              width: sw(a.width),
              height: sw(a.height),
              rotate: rot ? degrees(-rot) : undefined
            })
            // Optional border (owner ask, 2026-09-04). Baked here as well as drawn
            // in the viewer, or a bordered picture exports naked — which is the
            // failure mode that matters, because the export is what gets sent.
            //
            // Drawn AFTER the image so the stroke sits on top of the picture edge
            // rather than being half-covered by it, and `opacity: 0` keeps the
            // rectangle's FILL invisible while the border still paints (the same
            // trick the outline-only rect case above uses).
            if (a.border && a.border.width > 0) {
              page.drawRectangle({
                x: sx(bx),
                y: toY(by),
                width: sw(a.width),
                height: sw(a.height),
                borderColor: hexToPdfRgb(a.border.color),
                borderWidth: sw(a.border.width),
                // ⚠️ pdf-lib takes the dash pattern in POINTS, already scaled —
                // passing raw annotation units would give a dash that looks right
                // on screen and wrong in the file at any zoom but 100%.
                borderDashArray: a.border.style === 'dashed'
                  ? [sw(a.border.width * 3), sw(a.border.width * 2)]
                  : undefined,
                opacity: 0,
                rotate: rot ? degrees(-rot) : undefined
              })
            }
            break
          }
          case 'sigfield': {
            // An unsigned box is not drawn into the page at all: it becomes a
            // real signature field once the pages are final (see
            // `addSignatureFields`), whose own appearance is the outline and
            // caption. Only a signed box is baked here.
            if (!a.signed) break
            // A signed LEGACY box (from an export before real fields, `locked`
            // with no field name) has the "Sign here • Name • Date" caption
            // baked into the page beneath it — paint the box white first so the
            // signature replaces it rather than sitting on top of it. A box
            // that came from a signature field needs nothing of the kind: the
            // field, appearance and all, is removed before this runs.
            if (a.locked && !a.fieldName) {
              page.drawRectangle({
                x: sx(a.x),
                y: toY(a.y + a.height),
                width: sw(a.width),
                height: sw(a.height),
                color: hexToPdfRgb('#ffffff')
              })
            }
            // Bake the signature image, contained inside the box (matches the
            // on-screen fit). Baseline of the box's bottom edge is a.y + height.
            const img = await images.embed(a.signed.src)
            const margin = 0.08
            const availW = a.width * (1 - margin * 2)
            const availH = a.height * (1 - margin * 2)
            const ratio = a.signed.width > 0 && a.signed.height > 0
              ? a.signed.width / a.signed.height
              : 1
            let fw = availW
            let fh = fw / ratio
            if (fh > availH) {
              fh = availH
              fw = fh * ratio
            }
            const fx = a.x + (a.width - fw) / 2
            const fy = a.y + (a.height - fh) / 2
            page.drawImage(img, {
              x: sx(fx),
              y: toY(fy + fh),
              width: sw(fw),
              height: sw(fh)
            })
            break
          }
        }
      }
    } finally {
      page.pushOperators(popGraphicsState())
    }
  }
}

/** True when a redaction overlaps the link's box — for an ellipse, the ellipse itself. */
function redactTouches(r: RedactAnnotation, l: PendingLink): boolean {
  if (!(l.x1 < r.x + r.width && l.x2 > r.x && l.y1 < r.y + r.height && l.y2 > r.y)) return false
  if (r.shape !== 'ellipse') return true
  // The point of the link's box nearest the ellipse's centre, in units of the
  // radii: inside the unit circle means the link reaches into the ellipse.
  const rx = r.width / 2
  const ry = r.height / 2
  const cx = r.x + rx
  const cy = r.y + ry
  const nx = (Math.min(Math.max(cx, l.x1), l.x2) - cx) / rx
  const ny = (Math.min(Math.max(cy, l.y1), l.y2) - cy) / ry
  return nx * nx + ny * ny < 1
}

// ── Signature fields ───────────────────────────────────────────────────────
// An unsigned "Sign here" box leaves as a REAL PDF signature field (an AcroForm
// field with /FT /Sig, one widget at the box), so whoever receives the file can
// sign it in whatever they have: Universal PDF, Adobe Acrobat or Reader, Apple
// Preview. Nothing is uploaded and nobody needs an account — the "Send for
// signature" route (SendForSignatureDialog) is just this file, shared.
//
// The visible outline and "Sign here • Name • Date" caption are the field's own
// appearance stream, NOT page content: a reader that signs the field replaces
// that appearance with the signature, so the caption goes with it instead of
// showing through underneath.

/** The `/T` names of the AcroForm's terminal signature fields, with their widgets. */
function signatureFields(pdf: PDFDocument): { field: PDFAcroField; name: string; signed: boolean }[] {
  const form = pdf.catalog.getAcroForm()
  if (!form) return []
  const out: { field: PDFAcroField; name: string; signed: boolean }[] = []
  for (const [field] of form.getAllFields()) {
    if (!(field instanceof PDFAcroSignature)) continue
    out.push({
      field,
      name: field.getFullyQualifiedName() ?? '',
      signed: !!field.dict.get(PDFName.of('V'))
    })
  }
  return out
}

/** Every page that lists `widget` (by reference or by object) in its /Annots. */
function dropWidgetFromPages(pdf: PDFDocument, widgetDict: PDFDict) {
  for (const page of pdf.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
    if (!annots) continue
    for (let i = annots.size() - 1; i >= 0; i--) {
      const entry = annots.get(i)
      const resolved = entry instanceof PDFRef ? pdf.context.lookup(entry) : entry
      if (resolved === widgetDict) annots.remove(i)
    }
  }
}

/**
 * Remove the source's signature fields that the editor turned into boxes
 * (matched by name), widgets and all. Each is either signed in the editor —
 * and baked into the page — or written back out as a fresh field, so leaving
 * the original behind would double it. Runs BEFORE the form is filled, whose
 * flatten would otherwise bake their appearances into the page.
 */
function removeSignatureFields(pdf: PDFDocument, names: Set<string>) {
  if (names.size === 0) return
  const form = pdf.catalog.getAcroForm()
  if (!form) return
  for (const { field, name, signed } of signatureFields(pdf)) {
    if (signed || !names.has(name)) continue
    try {
      if (!(field instanceof PDFAcroSignature)) continue
      for (const w of field.getWidgets()) dropWidgetFromPages(pdf, w.dict)
      form.removeField(field)
    } catch {
      // A malformed field stays as it was: a duplicate box is a cosmetic
      // problem, a failed export is not.
    }
  }
}

/** Inverse of a view → user matrix (rotation by a multiple of 90° plus a shift). */
function invertMatrix(m: Matrix): Matrix {
  const [a, b, c, d, e, f] = m
  const det = a * d - b * c || 1
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]
}

/** The "Sign here • Name • Date" caption, in the language the app is in. */
function sigFieldCaption(a: Pick<SignatureFieldAnnotation, 'requireName' | 'requireDate' | 'requireLive'>): string {
  const t = getT()
  const parts: string[] = []
  if (a.requireName) parts.push(t('lib.sign_here_name'))
  if (a.requireDate) parts.push(t('lib.sign_here_date'))
  if (a.requireLive) parts.push(t('lib.sign_here_live'))
  return [t('lib.sign_here'), ...parts].join(' • ')
}

/**
 * Write each unsigned box as a signature field on its page. `scale` is the
 * annotation space's scale (1 on every export path — see EXPORT_SCALE).
 */
async function addSignatureFields(pdf: PDFDocument, boxes: SignatureFieldAnnotation[], scale: number) {
  if (boxes.length === 0) return
  const pages = pdf.getPages()
  const fonts = new ExportFonts(pdf)
  const acroForm = pdf.catalog.getOrCreateAcroForm()
  const taken = new Set(signatureFields(pdf).map((f) => f.name))
  for (const [field] of acroForm.getAllFields()) {
    const n = field.getFullyQualifiedName()
    if (n) taken.add(n)
  }
  let counter = 1
  const nextName = (wanted?: string) => {
    if (wanted && !taken.has(wanted)) {
      taken.add(wanted)
      return wanted
    }
    while (taken.has(`Signature${counter}`)) counter++
    const n = `Signature${counter}`
    taken.add(n)
    return n
  }
  const orange = hexToPdfRgb('#ea580c')
  const captionColour = hexToPdfRgb('#c2410c')

  for (const a of boxes) {
    const page = pages[a.pageIndex]
    if (!page) continue
    try {
      const frame = pageFrame(page)
      const w = a.width / scale
      const h = a.height / scale
      // The box in view space (y up), then its corners in the page's user space.
      const left = a.x / scale
      const top = frame.height - a.y / scale
      const corners = [
        applyMatrix(frame.m, left, top - h),
        applyMatrix(frame.m, left + w, top - h),
        applyMatrix(frame.m, left, top),
        applyMatrix(frame.m, left + w, top)
      ]
      const xs = corners.map((p) => p[0])
      const ys = corners.map((p) => p[1])
      const rect = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]

      // Appearance, drawn upright in the READER's view of the page: the form's
      // /Matrix is the page's view → user rotation, so on a /Rotate 90 page it
      // turns with the page exactly as the page's own content does.
      const caption = sigFieldCaption(a)
      const { font, text } = await fonts.forText(caption, 'helvetica')
      const size = Math.min(h * 0.28, 18)
      const pad = Math.min(8, h * 0.12, w * 0.06)
      const ops = [
        pushGraphicsState(),
        ...drawRectangle({
          x: 0.75,
          y: 0.75,
          width: Math.max(0, w - 1.5),
          height: Math.max(0, h - 1.5),
          borderWidth: 1.5,
          color: undefined,
          borderColor: orange,
          borderDashArray: [4, 3],
          rotate: degrees(0),
          xSkew: degrees(0),
          ySkew: degrees(0)
        }),
        popGraphicsState(),
        pushGraphicsState(),
        ...drawText(font.encodeText(text), {
          x: pad,
          y: h - pad - size * 0.85,
          size,
          font: 'F0',
          color: captionColour,
          rotate: degrees(0),
          xSkew: degrees(0),
          ySkew: degrees(0)
        }),
        popGraphicsState()
      ]
      const [ma, mb, mc, md] = frame.m
      const ap = pdf.context.formXObject(ops, {
        BBox: [0, 0, w, h],
        Matrix: [ma, mb, mc, md, 0, 0],
        Resources: { Font: { F0: font.ref } }
      })
      const apRef = pdf.context.register(ap)

      const require: string[] = []
      if (a.requireName) require.push('Name')
      if (a.requireDate) require.push('Date')
      if (a.requireLive) require.push('Live')

      const widget = pdf.context.obj({
        Type: 'Annot',
        Subtype: 'Widget',
        FT: 'Sig',
        T: PDFHexString.fromText(nextName(a.fieldName)),
        // The tooltip readers show on hover, and what a screen reader announces.
        TU: PDFHexString.fromText(caption),
        Rect: rect.map((n) => PDFNumber.of(n)),
        // Print: a field that vanished on paper would leave nothing to sign by hand.
        F: 4,
        P: page.ref,
        AP: { N: apRef },
        [SIG_REQUIRE_KEY]: require
      })
      const ref = pdf.context.register(widget)
      const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
      if (annots) annots.push(ref)
      else page.node.set(PDFName.of('Annots'), pdf.context.obj([ref]))
      acroForm.addField(ref)
    } catch {
      // One box that cannot be written must not cost the whole export.
    }
  }
}

/** Add the collected links to the finished pages — except any a redaction covers. */
function addLinks(pdf: PDFDocument, links: PendingLink[], redactsByPage: Map<number, RedactAnnotation[]>, scale: number) {
  const pages = pdf.getPages()
  for (const l of links) {
    const page = pages[l.pageIndex]
    if (!page) continue
    // A link under a redaction box would leave its address in the file and a
    // live hot spot over the black — both things the box is there to remove.
    const covered = (redactsByPage.get(l.pageIndex) ?? []).some((r) => redactTouches(r, l))
    if (covered) continue
    const frame = pageFrame(page)
    const [ax, ay] = applyMatrix(frame.m, l.x1 / scale, frame.height - l.y1 / scale)
    const [bx, by] = applyMatrix(frame.m, l.x2 / scale, frame.height - l.y2 / scale)
    const linkAnnot = pdf.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)],
      Border: [0, 0, 0],
      A: pdf.context.obj({
        Type: 'Action',
        S: 'URI',
        URI: PDFString.of(l.uri)
      })
    })
    const ref = pdf.context.register(linkAnnot)
    const existing = page.node.lookup(PDFName.of('Annots'), PDFArray)
    if (existing) existing.push(ref)
    else page.node.set(PDFName.of('Annots'), pdf.context.obj([ref]))
  }
}

export async function buildAnnotatedPdfBytes(
  sourceBytes: ArrayBuffer,
  annotations: Annotation[],
  scale: number,
  formValues?: FormFieldValue[]
): Promise<Uint8Array> {
  // updateMetadata: false — pdf-lib otherwise stamps its own Producer and a
  // fresh ModDate on every save, which would quietly re-add metadata to a
  // document the user had just scrubbed (see lib/pdfMetadata.ts).
  const sourcePdf = await PDFDocument.load(sourceBytes, { updateMetadata: false })

  // Signature fields the editor shows as boxes are replaced by those boxes —
  // see removeSignatureFields. Before the form is filled and flattened.
  removeSignatureFields(
    sourcePdf,
    new Set(annotations.flatMap((a) => (a.type === 'sigfield' && a.fieldName ? [a.fieldName] : [])))
  )

  if (formValues && formValues.length > 0) {
    await fillForm(sourcePdf, formValues, new ExportFonts(sourcePdf))
  }

  // Group redact annotations by page — these drive the rasterize-and-rebuild
  // pass below — and note where the LAST box on each page sits in the stack.
  const redactsByPage = new Map<number, RedactAnnotation[]>()
  const lastRedactAt = new Map<number, number>()
  annotations.forEach((a, i) => {
    if (a.type !== 'redact') return
    if (!redactsByPage.has(a.pageIndex)) redactsByPage.set(a.pageIndex, [])
    redactsByPage.get(a.pageIndex)!.push(a)
    lastRedactAt.set(a.pageIndex, i)
  })

  // ⚠️ THE USER'S OWN MARKS GO UNDER THE REDACTION, not over it. On screen the
  // annotations stack in array order, so a box drawn after a text box or a
  // pasted picture hides it. The export used to rasterise the page with the
  // boxes and THEN draw every annotation on top — so somebody who typed an ID
  // number and redacted over it saw a black box, and sent a file with the
  // number printed on top of the black.
  //
  // So everything beneath the topmost box on its page is drawn FIRST, into the
  // source, and goes through the rasteriser with the page: under a box it is
  // burnt out along with the text. Only what was placed after every box on
  // its page — a signature added once the redacting was done — is drawn on top
  // afterwards, as it was on screen.
  const under: Annotation[] = []
  const over: Annotation[] = []
  annotations.forEach((a, i) => {
    if (a.type === 'redact') return
    const last = lastRedactAt.get(a.pageIndex)
    if (last !== undefined && i > last) over.push(a)
    else under.push(a)
  })

  const links: PendingLink[] = []
  await drawAnnotations(sourcePdf, under, scale, links)

  // If any page needs redaction, rebuild the document so redacted pages
  // become flat raster images (no original text/forms survive in the
  // content stream). Pages without redacts are copied across unchanged.
  let pdf: PDFDocument
  if (redactsByPage.size > 0) {
    const flatBytes = await sourcePdf.save()
    // Destroyed as soon as the pages are drawn. This used to be left alive on
    // purpose — destroying it could kill the shared worker under a document
    // loading beside it — which `openPdf`'s app-owned worker has since made
    // safe (lib/pdfjs.ts). Left alive, it kept a whole copy of the document in
    // the worker for every export until the tab closed.
    const pdfjsDoc = await openPdf(flatBytes.slice()).promise
    const out = await PDFDocument.create()
    try {
      for (let i = 0; i < sourcePdf.getPageCount(); i++) {
        const redacts = redactsByPage.get(i)
        if (redacts) {
          const { jpeg, width, height } = await rasterizePage(pdfjsDoc, i, 2, 0.92, (ctx, k) => {
            // The block only — never the editor's "This will be redacted on
            // export" hint, which is drawn by the annotation layer and has no
            // counterpart here.
            for (const r of redacts) {
              ctx.fillStyle = redactFillHex(r.fill)
              const x = (r.x / scale) * k
              const y = (r.y / scale) * k
              const w = (r.width / scale) * k
              const h = (r.height / scale) * k
              if (r.shape === 'ellipse') {
                // Only the inside of the circle, as on screen. The whole page
                // is rasterised regardless, so nothing outside it survives as
                // text either — it just stays visible.
                ctx.beginPath()
                ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
                ctx.fill()
              } else {
                ctx.fillRect(x, y, w, h)
              }
            }
          })
          // ⚠️ Sized to the page AS SEEN — rotation and crop already applied
          // by the render — and given no /Rotate of its own. Sizing it from
          // the MediaBox (as this did) squashed a rotated page's picture into
          // portrait and stretched a cropped one over the uncropped area.
          const img = await out.embedJpg(jpeg)
          const newPage = out.addPage([width, height])
          newPage.drawImage(img, { x: 0, y: 0, width, height })
        } else {
          const [copied] = await out.copyPages(sourcePdf, [i])
          out.addPage(copied)
        }
      }
    } finally {
      void pdfjsDoc.destroy()
    }
    pdf = out
    await drawAnnotations(pdf, over, scale, links)
  } else {
    pdf = sourcePdf
  }
  addLinks(pdf, links, redactsByPage, scale)

  // Unsigned boxes leave as real signature fields (see addSignatureFields).
  // Signed ones were baked into the page above. The legacy catalog copy is
  // dropped, so a re-saved old file does not carry its boxes twice.
  try {
    pdf.catalog.delete(PDFName.of(SIG_FIELDS_KEY))
  } catch {
    // Nothing to drop.
  }
  await addSignatureFields(
    pdf,
    annotations.filter((a): a is SignatureFieldAnnotation => a.type === 'sigfield' && !a.signed),
    scale
  )

  return pdf.save()
}

// Read back the unsigned "Sign here" boxes a PDF carries, so they open as boxes
// that can be tapped and signed. Two sources:
//
//   • REAL SIGNATURE FIELDS (AcroForm /FT /Sig with no value) — what Universal
//     PDF writes since 2026-10-12, and what Acrobat and other apps make when
//     someone prepares a document for signing. Signed fields are left alone.
//   • The legacy catalog key (SIG_FIELDS_KEY), for files exported before that.
//
// Returns [] for a file with neither (or one that can't be parsed).
// Coordinates come back in the annotation store's space: the reader's view of
// the page in points, y down from its top-left (EXPORT_SCALE = 1).
export async function readEmbeddedSigFields(
  bytes: ArrayBuffer
): Promise<SignatureFieldAnnotation[]> {
  let pdf: PDFDocument
  try {
    pdf = await PDFDocument.load(bytes, { updateMetadata: false })
  } catch {
    return []
  }
  const out: SignatureFieldAnnotation[] = []
  try {
    out.push(...readSignatureFields(pdf))
  } catch {
    // Best-effort, like the legacy read below.
  }
  try {
    out.push(...readLegacySigFields(pdf))
  } catch {
    // Ignore — the file simply has no recoverable legacy boxes.
  }
  return out
}

/** Unsigned AcroForm signature fields, one box per visible widget. */
function readSignatureFields(pdf: PDFDocument): SignatureFieldAnnotation[] {
  const pages = pdf.getPages()
  const out: SignatureFieldAnnotation[] = []
  for (const { field, name, signed } of signatureFields(pdf)) {
    if (signed || !name || !(field instanceof PDFAcroSignature)) continue
    const widgets = field.getWidgets()
    widgets.forEach((widget, wi) => {
      // Hidden (bit 2) and NoView (bit 6) widgets are not meant to be seen.
      const flags = widget.getFlags()
      if (flags & 2 || flags & 32) return
      const pageIndex = widgetPageIndex(pdf, pages, widget.P(), widget.dict)
      if (pageIndex < 0) return
      const frame = pageFrame(pages[pageIndex])
      const r = widget.getRectangle()
      const inv = invertMatrix(frame.m)
      const pts = [
        applyMatrix(inv, r.x, r.y),
        applyMatrix(inv, r.x + r.width, r.y + r.height)
      ]
      const vx = Math.min(pts[0][0], pts[1][0])
      const vTop = Math.max(pts[0][1], pts[1][1])
      const width = Math.abs(pts[1][0] - pts[0][0])
      const height = Math.abs(pts[1][1] - pts[0][1])
      if (width < 2 || height < 2) return // an invisible "field" with no area
      // Ours carries the require-list; anyone else's asks for a plain signature.
      const req = widget.dict.lookupMaybe(PDFName.of(SIG_REQUIRE_KEY), PDFArray)
        ?? field.dict.lookupMaybe(PDFName.of(SIG_REQUIRE_KEY), PDFArray)
      const asks = new Set(req ? req.asArray().map((n) => (n instanceof PDFName ? n.decodeText() : '')) : [])
      out.push({
        type: 'sigfield',
        id: `sigfield-${name}-${wi}`.replace(/[^\w-]/g, '_'),
        pageIndex,
        x: vx,
        y: frame.height - vTop,
        width,
        height,
        requireName: asks.has('Name'),
        requireDate: asks.has('Date'),
        requireLive: asks.has('Live'),
        // Click-to-sign only, and it stays put: the field's own appearance
        // (when it has one) is drawn by pdf.js at exactly this spot.
        locked: true,
        fieldName: name,
        // Our own field draws its outline and caption in its appearance, so the
        // overlay over it stays invisible; another app's is usually blank, so
        // the overlay draws the "Sign here" box itself.
        fieldLook: req ? 'ours' : 'other'
      })
    })
  }
  return out
}

/** The page a widget sits on: its /P when that is a page, else whichever page lists it. */
function widgetPageIndex(pdf: PDFDocument, pages: PDFPage[], p: PDFRef | undefined, dict: PDFDict): number {
  if (p) {
    const i = pages.findIndex((pg) => pg.ref === p)
    if (i >= 0) return i
  }
  for (let i = 0; i < pages.length; i++) {
    const annots = pages[i].node.lookupMaybe(PDFName.of('Annots'), PDFArray)
    if (!annots) continue
    for (let j = 0; j < annots.size(); j++) {
      const entry = annots.get(j)
      if ((entry instanceof PDFRef ? pdf.context.lookup(entry) : entry) === dict) return i
    }
  }
  return -1
}

/** Boxes from the legacy catalog key (exports before real signature fields). */
function readLegacySigFields(pdf: PDFDocument): SignatureFieldAnnotation[] {
  const raw = pdf.catalog.get(PDFName.of(SIG_FIELDS_KEY)) as unknown
  const decodable = raw as { decodeText?: () => string } | undefined
  const text =
    decodable && typeof decodable.decodeText === 'function'
      ? decodable.decodeText()
      : null
  if (!text) return []
  const parsed: unknown = JSON.parse(text)
  if (!Array.isArray(parsed)) return []
  const out: SignatureFieldAnnotation[] = []
  for (const v of parsed as Partial<EmbeddedSigField>[]) {
    if (
      v &&
      typeof v.id === 'string' &&
      typeof v.pageIndex === 'number' &&
      typeof v.x === 'number' &&
      typeof v.y === 'number' &&
      typeof v.width === 'number' &&
      typeof v.height === 'number'
    ) {
      out.push({
        type: 'sigfield',
        id: v.id,
        pageIndex: v.pageIndex,
        x: v.x,
        y: v.y,
        width: v.width,
        height: v.height,
        requireName: !!v.requireName,
        requireDate: !!v.requireDate,
        requireLive: !!v.requireLive,
        // The outline is baked into this exported page, so the re-detected box
        // is locked in place — click-to-sign only. Editing/moving comes from a
        // `.unipdf` backup, which restores the original unlocked annotation.
        locked: true
      })
    }
  }
  return out
}

export { downloadPdfBytes }

export async function exportPdfWithAnnotations(
  sourceBytes: ArrayBuffer,
  annotations: Annotation[],
  scale: number,
  fileName: string,
  formValues?: FormFieldValue[]
) {
  const bytes = await buildAnnotatedPdfBytes(sourceBytes, annotations, scale, formValues)
  const outName = fileName.replace(/\.pdf$/i, '') + '-v2.pdf'
  downloadPdfBytes(bytes, outName)
}

/**
 * Does this document contain any raster image at all?
 *
 * The point is to know whether the rasterising qualities ('balanced' /
 * 'strong') could POSSIBLY help before spending a pass finding out. They shrink
 * a file by re-encoding its pictures at a lower resolution; a document with no
 * pictures has nothing for them to take, so turning its pages into JPEGs only
 * ever inflates it — the comment on `fellBackToLossless` has the numbers, 7 KB
 * of text becoming ~860 KB of JPEG.
 *
 * Walks each page's Resources → XObject dictionary looking for a /Subtype
 * /Image. Cheap: dictionary lookups on an already-parsed document, no decoding
 * and no re-serialising.
 *
 * ⚠️ Deliberately errs towards TRUE. Every failure path — a malformed
 * resource dict, an XObject we cannot resolve, an exception — reports "there
 * might be images", because the cost of being wrong is asymmetric: a false
 * `true` shows a compression control that turns out not to help, while a false
 * `false` silently removes the one setting that would have shrunk someone's
 * 45 MB scan.
 */
export function hasRasterImages(pdf: PDFDocument): boolean {
  try {
    for (const page of pdf.getPages()) {
      const resources = page.node.Resources()
      if (!resources) return true // can't tell — assume it might
      const xobjects = resources.lookupMaybe(PDFName.of('XObject'), PDFDict)
      if (!xobjects) continue // this page genuinely has none
      for (const key of xobjects.keys()) {
        const xobj = xobjects.lookupMaybe(key, PDFStream)
        if (!xobj) return true // unresolvable — assume it might
        const subtype = xobj.dict.lookupMaybe(PDFName.of('Subtype'), PDFName)
        if (subtype === PDFName.of('Image')) return true
        // A Form XObject can nest images of its own. Rather than recurse
        // through arbitrary nesting, treat it as "might".
        if (subtype === PDFName.of('Form')) return true
      }
    }
    return false
  } catch {
    return true
  }
}

// 'light' keeps everything lossless (text stays selectable) and just re-packs
// the file with object streams. 'balanced' and 'strong' rasterize each page to
// JPEG — losing text selectability but shrinking image-heavy PDFs a lot — with
// progressively lower render resolution and JPEG quality.
export type CompressQuality = 'light' | 'balanced' | 'strong'

// ⚠️ 'balanced' is the default the landing page's 1-click compress uses, so it
// is the setting people actually judge the app by, and it has to survive being
// looked at. 1.5x/0.70 shrank a 12 MB pack to 860 KB but read visibly soft on
// screen — the gap to 'light' was a cliff, not a step. 2.0x (≈144 DPI) with
// JPEG 0.82 lands a few hundred KB higher and stays sharp; 'strong' keeps the
// aggressive end of the range for when size is all that matters.
const RASTER_SETTINGS: Record<'balanced' | 'strong', { renderScale: number; jpegQuality: number }> = {
  balanced: { renderScale: 2.0, jpegQuality: 0.82 },
  strong: { renderScale: 1.0, jpegQuality: 0.45 }
}

export interface CompressResult {
  bytes: Uint8Array
  originalSize: number
  compressedSize: number
  fileName: string
  quality: CompressQuality
  /** Set when a rasterising quality was asked for but produced a *bigger* file
   *  than the lossless pass, so the lossless bytes were returned instead. A
   *  text-only PDF is the common case: 7 KB of text becomes ~860 KB of JPEG. */
  fellBackToLossless?: boolean
}

// ⚠️ Mobile Safari refuses to back a canvas past roughly 16.7M pixels, and
// hands back a blank (or null) bitmap rather than an error. A4 at 2x is 2M and
// nowhere near it, but a poster-sized page is: A0 at 2x is 16M, right on the
// line. Cap the area and drop the scale to fit, so a big page degrades to a
// slightly softer render instead of a blank one.
const MAX_RASTER_PIXELS = 8_000_000

// Render one source page through pdfjs at the given DPI and return JPEG bytes,
// with the page's size AS SEEN (its CropBox, turned by its /Rotate) in points —
// which is the size the picture must be placed at. `paint` draws over the
// render first; `k` is canvas pixels per point.
async function rasterizePage(
  pdfjsDoc: PDFDocumentProxy,
  pageIndex: number,
  renderScale: number,
  jpegQuality: number,
  paint?: (ctx: CanvasRenderingContext2D, k: number) => void
): Promise<{ jpeg: Uint8Array; width: number; height: number }> {
  const page = await pdfjsDoc.getPage(pageIndex + 1)
  const unscaled = page.getViewport({ scale: 1 })
  const pixelsAtScale = unscaled.width * unscaled.height * renderScale * renderScale
  const scale =
    pixelsAtScale > MAX_RASTER_PIXELS
      ? renderScale * Math.sqrt(MAX_RASTER_PIXELS / pixelsAtScale)
      : renderScale
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  // JPEG has no alpha — paint white first so transparent regions don't go black.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  paint?.(ctx, scale)
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/jpeg',
      jpegQuality
    )
  })
  // Hand the pixels back now rather than whenever the collector gets to them:
  // a long document makes one of these per page.
  canvas.width = 0
  canvas.height = 0
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), width: unscaled.width, height: unscaled.height }
}

// A rasterised result this much smaller than the input is a landslide the
// lossless pass cannot overturn: repacking removes structural slack, never
// image data, so a third off is a good day for it and half is out of reach.
// Below this ratio we skip the yardstick save entirely — see compressPdf.
const LANDSLIDE_RATIO = 0.5

/** Estimated output size of each rasterising quality, in bytes. */
export interface RasterEstimate {
  balanced: number
  strong: number
}

/**
 * Predict what the rasterising qualities would produce, WITHOUT doing the full
 * pass.
 *
 * The export dialog needs to know whether 'balanced' / 'strong' are worth
 * offering at all. Actually compressing at every quality to find out is not an
 * option: a rasterising pass over a long document is minutes of work, and the
 * whole point is to answer the question before the user commits to one.
 *
 * So: rasterise ONE page at each setting, measure the JPEG, and multiply by the
 * page count. Rasterising replaces every page with a picture of itself at fixed
 * render settings, so per-page output size is roughly uniform across a document
 * — which is exactly what makes one sample extrapolate honestly here, and would
 * not for a compressor whose output tracked the input's composition.
 *
 * ⚠️ Samples the MIDDLE page, not the first. A first page is disproportionately
 * often a cover, a title page or a mostly-blank letterhead — the least
 * representative page in the file, and one that compresses far smaller than the
 * dense pages after it. Sampling it would underestimate the output and offer a
 * saving that never arrives.
 *
 * The result is an estimate and is only ever used to decide whether to SHOW an
 * option. The size the dialog reports is always really measured.
 */
export async function estimateRasterSizes(sourceBytes: ArrayBuffer): Promise<RasterEstimate> {
  const pdfjsDoc = await openPdf(sourceBytes.slice(0)).promise
  const pageCount = pdfjsDoc.numPages
  const sampleIndex = Math.floor(pageCount / 2)
  const measure = async (q: 'balanced' | 'strong') => {
    const { renderScale, jpegQuality } = RASTER_SETTINGS[q]
    const { jpeg } = await rasterizePage(pdfjsDoc, sampleIndex, renderScale, jpegQuality)
    // + a little per page for the PDF object overhead wrapping each image.
    return (jpeg.byteLength + 512) * pageCount
  }
  try {
    return { balanced: await measure('balanced'), strong: await measure('strong') }
  } finally {
    void pdfjsDoc.destroy()
  }
}

export async function compressPdf(
  sourceBytes: ArrayBuffer,
  fileName: string,
  quality: CompressQuality = 'light',
  onProgress: (fraction: number) => void = () => {},
  /**
   * Keep the rasterised pages even when they come out BIGGER than the lossless
   * save. Off everywhere that is compressing for size — where handing back a
   * larger file would be absurd — and on for the export dialog's "Flatten pages
   * to images" checkbox, where size is not what is being asked for.
   *
   * ⚠️ Without this, ticking that box on a text document silently does nothing:
   * the fallback below returns the lossless bytes, the text layer survives, and
   * the user sends out a file believing its text cannot be copied. That is the
   * one failure mode of this feature that is worse than not having it, because
   * it is invisible and it is the opposite of what was asked for.
   */
  keepRasterEvenIfBigger = false
): Promise<CompressResult> {
  const originalSize = sourceBytes.byteLength
  const outName = fileName.replace(/\.pdf$/i, '') + '-compressed.pdf'
  onProgress(0.05)

  if (quality === 'light') {
    const pdf = await PDFDocument.load(sourceBytes, { updateMetadata: false })
    onProgress(0.5)
    const bytes = await pdf.save({ useObjectStreams: true })
    onProgress(1)
    return { bytes, originalSize, compressedSize: bytes.byteLength, fileName: outName, quality }
  }

  const { renderScale, jpegQuality } = RASTER_SETTINGS[quality]
  // pdfjs detaches the buffer it's handed, so give it a copy and keep the
  // original for pdf-lib (which we use for each page's size, and for the
  // lossless yardstick below).
  const pdfjsDoc = await openPdf(sourceBytes.slice(0)).promise
  const srcPdf = await PDFDocument.load(sourceBytes, { updateMetadata: false })
  const out = await PDFDocument.create()
  const pageCount = srcPdf.getPageCount()
  try {
    for (let i = 0; i < pageCount; i++) {
      // ⚠️ The size comes from the render, not `getSize()` (the MediaBox): on a
      // rotated or cropped page those differ, and the picture was squashed to fit.
      const { jpeg, width, height } = await rasterizePage(pdfjsDoc, i, renderScale, jpegQuality)
      const img = await out.embedJpg(jpeg)
      const page = out.addPage([width, height])
      page.drawImage(img, { x: 0, y: 0, width, height })
      // Rendering is nearly all the wall-clock, so the bar is the page counter.
      onProgress(0.05 + ((i + 1) / pageCount) * 0.9)
    }
  } finally {
    // Every page is drawn: free pdf.js's copy of the document (and its decoded
    // images) before the save below needs the memory — on a big scan this is
    // the difference that mattered.
    void pdfjsDoc.destroy()
  }
  const bytes = await out.save({ useObjectStreams: true })
  // ⚠️ Rasterising is only a win when there is something raster-shaped to win.
  // A text-only PDF turns 7 KB of glyphs into ~860 KB of JPEG — 100× bigger,
  // with the text no longer selectable. "Compress PDF(s)" must never hand back
  // a bigger file than it was given, so the lossless pass is the yardstick and
  // whichever is smaller wins. Same document either way; only the bytes differ.
  //
  // But that yardstick is the most expensive step in here — it serialises the
  // whole source document a second time, which on a 45 MB scan means a second
  // 45 MB buffer on top of the source, pdfjs's copy and the parsed doc. Big
  // files were dying on it. So only pay for it when the lossless pass could
  // plausibly win: a landslide raster result is already smaller than anything
  // a repack could produce, and is returned without measuring.
  if (bytes.byteLength < originalSize * LANDSLIDE_RATIO) {
    onProgress(1)
    return { bytes, originalSize, compressedSize: bytes.byteLength, fileName: outName, quality }
  }
  const lossless = await srcPdf.save({ useObjectStreams: true })
  onProgress(1)
  if (bytes.byteLength >= lossless.byteLength && !keepRasterEvenIfBigger) {
    return {
      bytes: lossless,
      originalSize,
      compressedSize: lossless.byteLength,
      fileName: outName,
      quality,
      fellBackToLossless: true
    }
  }
  return { bytes, originalSize, compressedSize: bytes.byteLength, fileName: outName, quality }
}
