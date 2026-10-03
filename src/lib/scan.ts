import { PDFDocument } from 'pdf-lib'
import { heicToJpegBytes } from './convert'
import { isHeicFile } from './heicSniff'
import { homography, outputSize, scanPageSize, type Paper, type Quad } from './scanGeometry'
import { getT } from '../i18n'

/**
 * Scanning: page images in, one PDF out — all on this device.
 *
 * Two roads lead here. On the phone apps the operating system's own document
 * scanner (VisionKit on iOS, ML Kit on Android — see `documentScanner.ts`)
 * hands back pages that are already found, cropped and flattened. Everywhere
 * else the user picks a photo and drags its four corners onto the page's
 * corners; `flattenPhoto` below does the rest. Both end in `scansToPdf`.
 */

/** A finished page: JPEG bytes and their pixel size. */
export interface ScanPage {
  jpeg: Uint8Array
  width: number
  height: number
}

export type ScanColour = 'colour' | 'grey' | 'bw'

// What every scanner does, for the same reason `imagesToPdf` gives for HEIC: a
// page as PNG is ten times the bytes for a picture nobody can tell apart.
const SCAN_JPEG_QUALITY = 0.85

// The longest edge a photo is decoded to before anything else happens. A 48 MP
// phone photo is 8000 px on its long side; holding it as RGBA is ~190 MB, which
// is the kind of number that ends a tab on a phone. 4000 px still gives the
// flattened page more detail than the 2500 px a 300 dpi A4 needs.
const MAX_SOURCE_EDGE = 4000
const MAX_PAGE_EDGE = 3000

/**
 * Decode a picked photo into a canvas, the right way up and no bigger than
 * MAX_SOURCE_EDGE. `createImageBitmap` applies the EXIF orientation, which is
 * what makes a portrait phone photo arrive portrait. HEIC (any iPhone photo
 * copied off the phone) goes through the same decoder `imagesToPdf` uses.
 */
export async function decodePhoto(file: File): Promise<HTMLCanvasElement> {
  const blob: Blob = (await isHeicFile(file))
    ? new Blob([(await heicToJpegBytes(file)) as BlobPart], { type: 'image/jpeg' })
    : file
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
  } catch {
    throw new Error(getT()('lib.image_decode_failed', { name: file.name }))
  }
  try {
    const scale = Math.min(1, MAX_SOURCE_EDGE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    bitmap.close()
  }
}

/**
 * Flatten the quadrilateral `quad` (in `source` pixels) to an upright page.
 *
 * Inverse mapping with bilinear sampling: for every output pixel, the
 * homography says where in the photo it came from, and the four photo pixels
 * around that point are blended. Plain JavaScript over the pixel array; a
 * 2500×3500 page is ~9 M samples, well under a second on a current phone.
 */
export async function flattenPhoto(
  source: HTMLCanvasElement,
  quad: Quad,
  colour: ScanColour,
): Promise<ScanPage> {
  const { width, height } = outputSize(quad, MAX_PAGE_EDGE)
  const rect: Quad = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ]
  const h = homography(rect, quad)

  const sctx = source.getContext('2d', { willReadFrequently: true })
  if (!sctx) throw new Error('Canvas 2D context unavailable')
  const sw = source.width
  const sh = source.height
  const src = sctx.getImageData(0, 0, sw, sh).data

  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const octx = out.getContext('2d')
  if (!octx) throw new Error('Canvas 2D context unavailable')
  const img = octx.createImageData(width, height)
  const dst = img.data

  for (let y = 0; y < height; y++) {
    // Sample at pixel centres.
    const yc = y + 0.5
    for (let x = 0; x < width; x++) {
      const xc = x + 0.5
      const w = h[6] * xc + h[7] * yc + h[8]
      let sx = (h[0] * xc + h[1] * yc + h[2]) / w - 0.5
      let sy = (h[3] * xc + h[4] * yc + h[5]) / w - 0.5
      // Clamp, so a corner dragged just off the photo repeats the edge rather
      // than leaving a black stripe down the page.
      if (sx < 0) sx = 0
      else if (sx > sw - 1) sx = sw - 1
      if (sy < 0) sy = 0
      else if (sy > sh - 1) sy = sh - 1
      const x0 = sx | 0
      const y0 = sy | 0
      const x1 = x0 + 1 < sw ? x0 + 1 : x0
      const y1 = y0 + 1 < sh ? y0 + 1 : y0
      const fx = sx - x0
      const fy = sy - y0
      const i00 = (y0 * sw + x0) * 4
      const i10 = (y0 * sw + x1) * 4
      const i01 = (y1 * sw + x0) * 4
      const i11 = (y1 * sw + x1) * 4
      const o = (y * width + x) * 4
      for (let c = 0; c < 3; c++) {
        const top = src[i00 + c] + (src[i10 + c] - src[i00 + c]) * fx
        const bottom = src[i01 + c] + (src[i11 + c] - src[i01 + c]) * fx
        dst[o + c] = top + (bottom - top) * fy
      }
      dst[o + 3] = 255
    }
  }

  if (colour === 'grey') toGrey(dst)
  else if (colour === 'bw') toBlackAndWhite(dst, width, height)

  octx.putImageData(img, 0, 0)
  return { jpeg: await canvasToJpeg(out), width, height }
}

function luma(d: Uint8ClampedArray, i: number): number {
  return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
}

function toGrey(d: Uint8ClampedArray): void {
  for (let i = 0; i < d.length; i += 4) {
    const v = luma(d, i)
    d[i] = d[i + 1] = d[i + 2] = v
  }
}

/**
 * Black ink on white paper, from a photo taken under a desk lamp.
 *
 * A single threshold fails on any real photo: the side of the page nearer the
 * window is brighter than the ink on the far side. So each pixel is compared
 * with the average brightness of the square around it (Bradley's adaptive
 * threshold, via an integral image so every window costs four lookups) and is
 * black only if it is clearly darker than its own neighbourhood.
 */
function toBlackAndWhite(d: Uint8ClampedArray, width: number, height: number): void {
  const grey = new Float32Array(width * height)
  for (let i = 0, p = 0; p < grey.length; i += 4, p++) grey[p] = luma(d, i)
  const stride = width + 1
  const integral = new Float64Array(stride * (height + 1))
  for (let y = 0; y < height; y++) {
    let row = 0
    for (let x = 0; x < width; x++) {
      row += grey[y * width + x]
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + row
    }
  }
  // About an eighth of the page: big enough to span a few letters, small
  // enough to follow a shadow across the sheet.
  const half = Math.max(8, Math.round(Math.max(width, height) / 16))
  const BELOW = 0.15
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - half)
    const y1 = Math.min(height, y + half + 1)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - half)
      const x1 = Math.min(width, x + half + 1)
      const sum =
        integral[y1 * stride + x1] - integral[y0 * stride + x1] - integral[y1 * stride + x0] + integral[y0 * stride + x0]
      const mean = sum / ((x1 - x0) * (y1 - y0))
      const v = grey[y * width + x] < mean * (1 - BELOW) ? 0 : 255
      const i = (y * width + x) * 4
      d[i] = d[i + 1] = d[i + 2] = v
    }
  }
}

async function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', SCAN_JPEG_QUALITY)
  })
  return new Uint8Array(await blob.arrayBuffer())
}

/** Read JPEG bytes into a page record (the phone scanners hand back files, so
 *  their size has to be measured rather than known). */
export async function pageFromJpeg(jpeg: Uint8Array): Promise<ScanPage> {
  const bitmap = await createImageBitmap(new Blob([jpeg as BlobPart], { type: 'image/jpeg' }))
  try {
    return { jpeg, width: bitmap.width, height: bitmap.height }
  } finally {
    bitmap.close()
  }
}

/** Turn a page a quarter-turn clockwise. Re-encodes the JPEG once. */
export async function rotatePage(page: ScanPage): Promise<ScanPage> {
  const bitmap = await createImageBitmap(new Blob([page.jpeg as BlobPart], { type: 'image/jpeg' }))
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.height
    canvas.height = bitmap.width
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    ctx.translate(canvas.width, 0)
    ctx.rotate(Math.PI / 2)
    ctx.drawImage(bitmap, 0, 0)
    return { jpeg: await canvasToJpeg(canvas), width: canvas.width, height: canvas.height }
  } finally {
    bitmap.close()
  }
}

/**
 * One PDF page per scanned page, each sized to the paper (see `scanPageSize`)
 * with the JPEG embedded as-is — no second round of compression.
 */
export async function scansToPdf(pages: ScanPage[], paper: Paper, title?: string): Promise<Uint8Array> {
  if (pages.length === 0) throw new Error(getT()('lib.images_none'))
  const out = await PDFDocument.create()
  if (title) out.setTitle(title)
  for (const p of pages) {
    const img = await out.embedJpg(p.jpeg)
    const size = scanPageSize(img.width, img.height, paper)
    const page = out.addPage([size.w, size.h])
    page.drawImage(img, { x: 0, y: 0, width: size.w, height: size.h })
  }
  return out.save({ useObjectStreams: true })
}
