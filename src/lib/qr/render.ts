// Turn a QrDesign into a PNG data URL, ready to place on a page.
//
// The composite itself — the plate, the decoration, the star layering, the
// corner stamp — lives in **@unisim/qr**, shared with Universal QR. What is
// here is this app's policy around it: the size a placed code is rendered at,
// and pulling a tenant's mark out of storage so nothing downstream depends on
// a URL still resolving.

import { renderQrCanvas, type QrDesign } from '@unisim/qr'

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

/**
 * Turn a remote image URL into a self-contained PNG data URI.
 *
 * Used to pull a tenant's company mark out of storage and into the design, so
 * that from then on nothing — the live preview, the placement render, the
 * exported PDF — depends on that URL still resolving.
 *
 * It goes through `<img>` + canvas rather than `fetch()` on purpose: the
 * desktop builds serve the app from their own protocol, where a strict CSP
 * refuses a cross-origin fetch, while loading an image is a permission those
 * builds already grant. It also flattens an SVG mark into pixels, which is what
 * qr-code-styling and the embedded PDF image both want.
 *
 * Rejects if the host serves no CORS header — the canvas is tainted and
 * `toDataURL` throws. Callers treat that as "no company mark available".
 */
export async function imageUrlToDataUrl(src: string, max = 512): Promise<string> {
  if (src.startsWith('data:')) return src
  const img = await loadImage(src)
  // An SVG with no intrinsic size reports 0×0; give it a square to draw into.
  const w = img.naturalWidth || max
  const h = img.naturalHeight || max
  const scale = Math.min(1, max / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available in this browser.')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

/**
 * Render `design` to a PNG data URL, `size` px square.
 *
 * Everything goes through the one composite — plain square codes included —
 * so the plate, the decoration and the corner stamp cannot drift apart the way
 * two parallel render paths would. On a shaped plate the code is rendered
 * smaller and centred inside the largest square that fits the silhouette; it is
 * never clipped to it, because a QR with a bite out of its modules or quiet
 * zone is a picture of a QR code rather than one.
 *
 * The quiet-zone margin travels with the size (a fixed 12px margin on a 1024px
 * render is a proportionally smaller quiet zone than the design was drawn
 * with, and the quiet zone is not decoration) — @unisim/qr does that scaling.
 */
export async function renderQrPng(design: QrDesign, size = PLACEMENT_SIZE): Promise<string> {
  if (!design.data.trim()) throw new Error('Enter a link or some text to encode.')
  const canvas = await renderQrCanvas(design, size)
  return canvas.toDataURL('image/png')
}
