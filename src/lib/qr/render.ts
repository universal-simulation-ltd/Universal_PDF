// Render a QrDesign to a PNG data URL, ready to place on a page.
//
// Everything goes through one canvas composite — plain square codes included —
// so the plate, the decoration and the corner stamp cannot drift apart from
// each other the way two parallel render paths would. qr-code-styling is
// browser-only and heavy, so it is imported lazily at call time to keep it out
// of the main bundle (the same treatment ../brandedQr gives it).

import {
  buildQrOptions,
  cornerStampGeometry,
  decorColour,
  showsCornerMark,
  unisimMarkUrl,
  type QrDesign
} from './design'
import { frameGeometry, traceFrame } from './frames'
import { DECOR_CODE_SCALE, drawDecor } from './decor'

/** The size a QR is rendered at when it goes onto a page. Generous on purpose:
 *  placed at the default ~200pt it works out around 360 dpi, so the code still
 *  scans off a printed page rather than only off a screen. */
export const PLACEMENT_SIZE = 1024

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = src
  })
}

/** The scale the code is drawn at — 1 unless decoration needs room. */
function decorScaleOf(design: QrDesign): number {
  return design.decorStyle && design.decorStyle !== 'none' ? DECOR_CODE_SCALE : 1
}

/** The same design at a different rendered size. The quiet-zone margin is in
 *  pixels, so it has to travel with the size — a fixed 12px margin on a 1024px
 *  render is a proportionally smaller quiet zone than the design was drawn
 *  with, and the quiet zone is not decoration. */
function atSize(design: QrDesign, size: number, transparent?: boolean): QrDesign {
  return {
    ...design,
    size,
    margin: Math.max(4, Math.round((design.margin / (design.size || size)) * size)),
    ...(transparent === undefined ? {} : { bgTransparent: transparent })
  }
}

/** Draw the white-tiled UNI·SIM corner stamp — used when the centre is already
 *  taken by an imported design's own brand logo. */
function drawCornerStamp(
  ctx: CanvasRenderingContext2D,
  mark: HTMLImageElement,
  x: number,
  y: number,
  badge: number
) {
  const pad = Math.round(badge * 0.08)
  const r = Math.round(badge * 0.16)
  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = 'rgba(0,0,0,0.06)'
  ctx.lineWidth = Math.max(1, Math.round(badge * 0.02))
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath()
    ctx.roundRect(x, y, badge, badge, r)
    ctx.fill()
    ctx.stroke()
  } else {
    ctx.fillRect(x, y, badge, badge)
    ctx.strokeRect(x, y, badge, badge)
  }
  ctx.restore()
  ctx.drawImage(mark, x + pad, y + pad, badge - 2 * pad, badge - 2 * pad)
}

/** Rasterise just the code (no plate, no decoration) at `size`. */
async function codeImage(design: QrDesign, size: number, transparent?: boolean): Promise<HTMLImageElement> {
  const QRCodeStyling = (await import('qr-code-styling')).default
  const qr = new QRCodeStyling(buildQrOptions(atSize(design, size, transparent)))
  const raw = await qr.getRawData('png')
  if (!(raw instanceof Blob)) throw new Error('QR render produced no image')
  const url = URL.createObjectURL(raw)
  try {
    return await loadImage(url)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Render `design` to a PNG data URL, `size` px square.
 *
 * On a shaped plate the code is rendered smaller and centred inside the largest
 * square that fits the silhouette — it is never clipped to it, because a QR
 * with a bite out of its modules or quiet zone is a picture of a QR code rather
 * than one. See ./frames.
 */
export async function renderQrPng(design: QrDesign, size = PLACEMENT_SIZE): Promise<string> {
  if (!design.data.trim()) throw new Error('Enter a link or some text to encode.')

  const shaped = design.frameShape !== 'square'
  // Decoration only exists on a shaped plate — a square one has no space around
  // the code to fill — so a square design never gives up room for it, however
  // its `decorStyle` happens to be set.
  const { inner, offset } = frameGeometry(design.frameShape, size, shaped ? decorScaleOf(design) : 1)

  // Inside a plate the code's own background is switched off so the plate shows
  // through; a plain square code keeps whatever background it was designed with.
  const qrImg = await codeImage(design, inner, shaped ? true : undefined)

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available in this browser.')

  if (shaped && !design.bgTransparent) {
    // With a transparent background the plate is skipped entirely, which gives
    // the genuinely useful result: a circular (or star, or hexagon) sticker on
    // transparency rather than a shape you cannot see.
    ctx.save()
    traceFrame(ctx, design.frameShape, size)
    ctx.clip()
    ctx.fillStyle = design.bgColor
    ctx.fillRect(0, 0, size, size)
    ctx.restore()
  }

  if (shaped && design.decorStyle !== 'none') {
    // Decoration goes UNDER the code and is clipped to the silhouette, so the
    // same marks fill a circle, a hexagon or a star without decor.ts knowing
    // which.
    ctx.save()
    traceFrame(ctx, design.frameShape, size)
    ctx.clip()
    drawDecor(ctx, design.decorStyle, design.frameShape, size, inner, decorColour(design))
    ctx.restore()
  }

  ctx.drawImage(qrImg, offset, offset, inner, inner)

  if (showsCornerMark(design)) {
    const { badge, x, y } = cornerStampGeometry(inner, atSize(design, inner).margin)
    drawCornerStamp(ctx, await loadImage(unisimMarkUrl()), offset + x, offset + y, badge)
  }

  return canvas.toDataURL('image/png')
}
