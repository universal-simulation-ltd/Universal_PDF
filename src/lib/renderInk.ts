// Rasterises captured pen strokes into a cropped PNG. Shared by the signature
// pad (which draws the strokes) and the on-canvas signature editor (which
// re-renders them when the "realistic" toggle is flipped after placement), so
// both produce byte-identical ink for the same strokes.

import { SIGNATURE_INK } from './signature'

// The plain, near-black line used when realism is off.
export const CLEAN_INK = '#0f172a'

// Ink colour follows the realism toggle (deep blue vs plain near-black).
export function inkColorFor(realistic: boolean): string {
  return realistic ? SIGNATURE_INK : CLEAN_INK
}

// Small seeded PRNG (mulberry32) so the ink jitter/speckles are deterministic
// for a given drawing — no flicker, stable output.
function mulberry32(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Stroke a smooth path through points using midpoint quadratics (matches the
// clean, tension-smoothed look of the on-screen preview).
function strokeSmooth(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  if (pts.length < 2) return
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2
    const my = (pts[i].y + pts[i + 1].y) / 2
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my)
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y)
  ctx.stroke()
}

// Render the captured pen strokes. With `realistic` on, lays down deep-blue ink
// with a faint bleed, a shaky-hand wobble, per-segment width variation (thinner
// when moving fast) and a couple of speckles — subtle cues that read as a real
// signature. With it off, draws a clean uniform smoothed line. Returns a
// cropped PNG + its logical (CSS-px) size.
export function renderInkSignature(
  lines: number[][],
  color: string,
  realistic: boolean
): { dataUrl: string; width: number; height: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const ln of lines) {
    for (let i = 0; i < ln.length; i += 2) {
      const x = ln[i], y = ln[i + 1]
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (!isFinite(minX)) return null

  const pad = 6
  minX -= pad; minY -= pad; maxX += pad; maxY += pad
  const w = Math.max(1, maxX - minX)
  const h = Math.max(1, maxY - minY)
  const RS = 2

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(w * RS)
  canvas.height = Math.ceil(h * RS)
  const ctx = canvas.getContext('2d')!
  ctx.scale(RS, RS)
  ctx.translate(-minX, -minY)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = color
  ctx.fillStyle = color

  const rnd = mulberry32(0x5eed)
  const JITTER = realistic ? 0.6 : 0
  const BASE_W = 2.4

  for (const ln of lines) {
    const pts: { x: number; y: number }[] = []
    for (let i = 0; i < ln.length; i += 2) {
      pts.push({
        x: ln[i] + (rnd() * 2 - 1) * JITTER,
        y: ln[i + 1] + (rnd() * 2 - 1) * JITTER
      })
    }
    if (pts.length === 0) continue
    if (pts.length === 1) {
      ctx.globalAlpha = 0.9
      ctx.beginPath()
      ctx.arc(pts[0].x, pts[0].y, BASE_W * 0.6, 0, Math.PI * 2)
      ctx.fill()
      continue
    }

    // Clean mode: one uniform smoothed stroke, no bleed/variation/speckles.
    if (!realistic) {
      ctx.globalAlpha = 1
      ctx.lineWidth = 2.5
      strokeSmooth(ctx, pts)
      continue
    }

    // Faint, slightly-wider blurred underlay → ink bleed.
    ctx.save()
    ctx.globalAlpha = 0.16
    ctx.lineWidth = BASE_W * 1.9
    try { ctx.filter = 'blur(0.6px)' } catch { /* filter unsupported — plain wide line */ }
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.stroke()
    ctx.restore()

    // Main pass: per-segment width + subtle alpha/width noise.
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i]
      const d = Math.hypot(b.x - a.x, b.y - a.y)
      let segW = BASE_W * (1 - Math.min(0.45, d / 45))
      segW *= 0.85 + rnd() * 0.3
      ctx.globalAlpha = 0.82 + rnd() * 0.18
      ctx.lineWidth = Math.max(0.8, segW)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }

    // A couple of tiny ink speckles near the stroke.
    const speckles = 1 + Math.floor(rnd() * 2)
    for (let k = 0; k < speckles; k++) {
      const p = pts[Math.floor(rnd() * pts.length)]
      ctx.globalAlpha = 0.35 + rnd() * 0.3
      ctx.beginPath()
      ctx.arc(p.x + (rnd() * 2 - 1) * 2, p.y + (rnd() * 2 - 1) * 2, 0.4 + rnd() * 0.7, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  ctx.globalAlpha = 1
  return { dataUrl: canvas.toDataURL('image/png'), width: w, height: h }
}
