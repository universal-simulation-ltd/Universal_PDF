// Plate decoration — the marks that fill the space a shaped plate leaves around
// the code, so the shape reads as designed rather than as a square code sitting
// on a round background.
//
// Ported from Universal QR (`src/lib/decor.ts`), canvas path only. It is here
// rather than skipped because a design saved in Universal QR carries its
// decoration: without this, importing a "Radial" or "Star" code would quietly
// render as something the user never designed.
//
// Every mark is generated OUTSIDE the code's own square boundary at its angle
// (innerAt), plus a margin, so nothing can land on a module or in its quiet
// zone. The geometry is deterministic — a seeded PRNG, never Math.random — so a
// given size always draws the same marks, and the preview matches what lands on
// the page.

import { frameRadiusAt, type FrameShape } from './frames'

export type DecorStyle = 'none' | 'burst' | 'scatter'

/** How much the code shrinks to open up room for decoration. */
export const DECOR_CODE_SCALE = 0.8

/** A decorative mark: a radial dash or a dot. */
type DecorMark =
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; w: number }
  | { kind: 'dot'; cx: number; cy: number; r: number }

/** Deterministic PRNG (mulberry32). Same inputs, same decoration, every time. */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SEED = 0x5eed

/**
 * Where the decoration may start, along `angle`.
 *
 * The code's own SQUARE edge, not its circumscribed circle — the circle
 * reserves the code's whole corner radius at every angle, leaving a dead gap
 * against its flat edges. A square's boundary at angle t is
 * (half-side)/max(|cos t|, |sin t|), which hugs the code and still cannot touch
 * it: the margin below is added on top, and the QR's quiet zone is inside
 * `codeInner` already.
 */
function innerAt(codeInner: number, size: number, angle: number): number {
  const half = codeInner / 2
  const c = Math.abs(Math.cos(angle))
  const sn = Math.abs(Math.sin(angle))
  return half / Math.max(c, sn, 1e-6) + size * 0.003
}

/**
 * How far past `innerAt` a given mark actually starts.
 *
 * Without this the decoration begins at exactly the same distance from the code
 * all the way round, which draws a perfectly straight-edged square hole — and a
 * straight edge is precisely what makes the eye read "square code, separate
 * decoration around it". Biased towards zero (rand³) so most marks still crowd
 * the code and only a few sit back.
 */
function ragged(rand: () => number, size: number): number {
  const r = rand()
  return size * 0.055 * r * r * r
}

/** Radial dashes, thinning and shortening outward. */
function burstMarks(shape: FrameShape, size: number, codeInner: number): DecorMark[] {
  const cx = size / 2
  const cy = size / 2
  const rand = seeded(SEED)
  const SPOKES = 150
  const BANDS = 4
  const marks: DecorMark[] = []

  for (let i = 0; i < SPOKES; i++) {
    // Jitter WITHIN a slot rather than a free random angle: free angles clump
    // and leave gaps, which reads as a mistake rather than as a pattern.
    const slot = (i + 0.5) / SPOKES
    const angle = slot * Math.PI * 2 + (rand() - 0.5) * ((Math.PI * 2) / SPOKES) * 0.9
    const r0 = innerAt(codeInner, size, angle) + ragged(rand, size)
    const r1 = frameRadiusAt(shape, size, angle) - size * 0.02
    if (r1 <= r0) continue
    const span = r1 - r0

    for (let band = 0; band < BANDS; band++) {
      const bandT = band / (BANDS - 1)
      // Thinning outward is what makes it read as a burst rather than a
      // striped ring; the innermost band is solid, the outermost sparse.
      if (band > 0 && rand() < 0.5 * bandT) continue
      const b0 = r0 + (span * band) / BANDS
      const b1 = r0 + (span * (band + 1)) / BANDS
      const len = (b1 - b0) * (0.35 + 0.45 * rand())
      const s0 = b0 + (b1 - b0 - len) * rand()
      const w = Math.max(1, size * (0.012 - 0.005 * bandT))

      // The innermost band is DOTS, not dashes, and the band beyond it is
      // mixed. A dash is a different material from a QR module, so matching the
      // module vocabulary where the two meet — then growing into dashes
      // outward — makes the code dissolve into the burst rather than sit in a
      // cut-out inside it.
      const asDot = band === 0 || (band === 1 && rand() < 0.45)
      if (asDot) {
        const rm = b0 + (b1 - b0) * rand()
        marks.push({
          kind: 'dot',
          cx: cx + rm * Math.cos(angle),
          cy: cy + rm * Math.sin(angle),
          r: w * 0.62
        })
        continue
      }

      marks.push({
        kind: 'line',
        x1: cx + s0 * Math.cos(angle),
        y1: cy + s0 * Math.sin(angle),
        x2: cx + (s0 + len) * Math.cos(angle),
        y2: cy + (s0 + len) * Math.sin(angle),
        w
      })
    }
  }
  return marks
}

/** Confetti: dots of varying size, densest against the code. */
function scatterMarks(shape: FrameShape, size: number, codeInner: number): DecorMark[] {
  const cx = size / 2
  const cy = size / 2
  const rand = seeded(SEED ^ 0x9e37)
  const marks: DecorMark[] = []
  const COUNT = 700

  for (let i = 0; i < COUNT; i++) {
    const angle = rand() * Math.PI * 2
    const r0 = innerAt(codeInner, size, angle) + ragged(rand, size)
    const r1 = frameRadiusAt(shape, size, angle) - size * 0.02
    if (r1 <= r0) continue
    // sqrt-distributed radius gives an EVEN area density; a linear one piles
    // everything against the code and leaves the rim bare.
    const r = Math.sqrt(r0 * r0 + rand() * (r1 * r1 - r0 * r0))
    const t = (r - r0) / (r1 - r0)
    // Thin out with radius so the edge fades rather than ending abruptly.
    if (rand() < t * 0.5) continue
    marks.push({
      kind: 'dot',
      cx: cx + r * Math.cos(angle),
      cy: cy + r * Math.sin(angle),
      r: size * (0.005 + 0.011 * rand() * (1 - 0.5 * t))
    })
  }
  return marks
}

/** Paint the decoration onto a 2D context. The caller has already clipped to
 *  the frame silhouette. */
export function drawDecor(
  ctx: CanvasRenderingContext2D,
  style: DecorStyle,
  shape: FrameShape,
  size: number,
  codeInner: number,
  colour: string
): void {
  if (style === 'none') return
  const marks = style === 'burst' ? burstMarks(shape, size, codeInner) : scatterMarks(shape, size, codeInner)
  if (marks.length === 0) return
  ctx.save()
  ctx.fillStyle = colour
  ctx.strokeStyle = colour
  ctx.lineCap = 'round'
  for (const m of marks) {
    if (m.kind === 'line') {
      ctx.beginPath()
      ctx.lineWidth = m.w
      ctx.moveTo(m.x1, m.y1)
      ctx.lineTo(m.x2, m.y2)
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.arc(m.cx, m.cy, m.r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}
