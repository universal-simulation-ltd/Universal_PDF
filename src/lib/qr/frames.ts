// Shaped QR plates — a circle, a hexagon, a star instead of the usual square.
//
// Ported from Universal QR (`src/lib/frames.ts`), trimmed to the canvas path:
// Universal PDF only ever needs a raster PNG to drop onto a page, so the SVG
// twins (`framePathData`, `frameSizeNote`) are left behind in that repo.
//
// ⚠️ The one rule this file exists to keep: **the code itself is never
// clipped.** A QR is only readable if every module and its quiet zone are
// present, so the shape can only ever be drawn *around or behind* the code. The
// code is rendered smaller and centred inside the largest square that fits
// within the shape; the shape is what gets drawn around it. Anything that
// trims the silhouette out of the modules produces a picture of a QR code, not
// a QR code.
//
// The one arrangement that is not a plate is `StarPlacement: 'behind'`, and it
// keeps the same rule from the other side: the star is drawn UNDER a code that
// covers its notches, so the code is complete and the star is what gets
// overlapped. Nothing is clipped there either.

export type FrameShape = 'square' | 'rounded' | 'circle' | 'squircle' | 'hexagon' | 'star'

/** Where the code sits relative to the star.
 *
 *  'inside' is the plate rule every other shape follows: the code is shrunk to
 *  the largest square that fits WITHIN the silhouette. For a star that square
 *  is tiny — 47% of the plate, and 37% once decoration takes its ring — because
 *  the star's five inward notches cut into every side of it.
 *
 *  'behind' turns the arrangement around: the star stops being the plate and
 *  becomes a backdrop, with the code drawn in front of it at 72% of the image.
 *  The code overlaps the notches, so only the five points show around it. */
export type StarPlacement = 'inside' | 'behind'

/** Side of the code, as a fraction of the image, when the star is behind it.
 *
 *  Bounded by the star's own points rather than picked to taste: the side
 *  points sit at x = 0.976 and the bottom two at y = 0.905, so a centred square
 *  wider than 0.81 swallows the bottom points and one wider than 0.95 swallows
 *  the sides. 0.72 clears the nearest of those (the bottom points) by 4.5% of
 *  the image, and still leaves the code half again as big as the inscribed
 *  square it replaces. */
export const STAR_BEHIND_CODE_SCALE = 0.72

/** A closed polygon in the unit square [0,1]², y down (canvas convention). */
type UnitPolygon = [number, number][]

const CURVE_SEGMENTS = 256

function circlePolygon(): UnitPolygon {
  const pts: UnitPolygon = []
  for (let i = 0; i < CURVE_SEGMENTS; i++) {
    const t = (i / CURVE_SEGMENTS) * Math.PI * 2
    pts.push([0.5 + 0.5 * Math.cos(t), 0.5 + 0.5 * Math.sin(t)])
  }
  return pts
}

// Superellipse |x|^n + |y|^n = 1 with n = 4 — the "squircle" corner most people
// recognise from app icons. Signed powers keep all four quadrants.
function squirclePolygon(): UnitPolygon {
  const n = 4
  const pts: UnitPolygon = []
  for (let i = 0; i < CURVE_SEGMENTS; i++) {
    const t = (i / CURVE_SEGMENTS) * Math.PI * 2
    const c = Math.cos(t)
    const s = Math.sin(t)
    const x = Math.sign(c) * Math.abs(c) ** (2 / n)
    const y = Math.sign(s) * Math.abs(s) ** (2 / n)
    pts.push([0.5 + 0.5 * x, 0.5 + 0.5 * y])
  }
  return pts
}

const ROUNDED_RADIUS = 0.18

function roundedPolygon(): UnitPolygon {
  const r = ROUNDED_RADIUS
  const per = Math.round(CURVE_SEGMENTS / 4)
  const corners: [number, number, number][] = [
    // [centre x, centre y, start angle] going clockwise from top-right
    [1 - r, r, -Math.PI / 2],
    [1 - r, 1 - r, 0],
    [r, 1 - r, Math.PI / 2],
    [r, r, Math.PI]
  ]
  const pts: UnitPolygon = []
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= per; i++) {
      const a = a0 + (i / per) * (Math.PI / 2)
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
    }
  }
  return pts
}

// Pointy-top regular hexagon, height 1, horizontally centred. Its bounding box
// is narrower than tall (width = √3/2), which is fine: the plate stays square
// and the hexagon is centred in it.
function hexagonPolygon(): UnitPolygon {
  const pts: UnitPolygon = []
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3
    pts.push([0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)])
  }
  return pts
}

// A five-point star. The inner radius is deliberately generous (0.62 of the
// outer, rather than the ~0.38 of a classic thin star): the inscribed square —
// and therefore the code — grows with it, and a thin star leaves so little room
// that the modules become unscannably small at ordinary export sizes.
const STAR_INNER_RATIO = 0.62

function starPolygon(): UnitPolygon {
  const pts: UnitPolygon = []
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.5 : 0.5 * STAR_INNER_RATIO
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    pts.push([0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)])
  }
  return pts
}

const UNIT_POLYGONS: Record<FrameShape, UnitPolygon> = {
  square: [[0, 0], [1, 0], [1, 1], [0, 1]],
  rounded: roundedPolygon(),
  circle: circlePolygon(),
  squircle: squirclePolygon(),
  hexagon: hexagonPolygon(),
  star: starPolygon()
}

/** Ray-cast point-in-polygon. */
function inside(poly: UnitPolygon, x: number, y: number): boolean {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

/** True when a centred axis-aligned square of half-side `a` lies wholly inside. */
function squareFits(poly: UnitPolygon, a: number): boolean {
  // Sample the square's PERIMETER, not just its four corners. Four corners is
  // enough for a convex shape but wrong for the star, whose inward notches can
  // cut through an edge while leaving every corner inside.
  const N = 240
  for (let i = 0; i < N; i++) {
    const t = (i / N) * 4
    const side = Math.floor(t)
    const f = t - side
    const lo = 0.5 - a
    const hi = 0.5 + a
    let x: number, y: number
    if (side === 0) { x = lo + f * 2 * a; y = lo }
    else if (side === 1) { x = hi; y = lo + f * 2 * a }
    else if (side === 2) { x = hi - f * 2 * a; y = hi }
    else { x = lo; y = hi - f * 2 * a }
    if (!inside(poly, x, y)) return false
  }
  return true
}

/** Side of the largest centred square that fits in `shape`, as a fraction of
 *  the plate. Binary-searched from the shape's own polygon rather than
 *  hand-derived per shape, so adding a shape cannot land a wrong constant. */
function computeInscribedFactor(shape: FrameShape): number {
  const poly = UNIT_POLYGONS[shape]
  if (shape === 'square') return 1
  let lo = 0
  let hi = 0.5
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (squareFits(poly, mid)) lo = mid
    else hi = mid
  }
  // Shave a hair off so a rounding-up of `inner` cannot poke a module over the
  // edge of the plate.
  return lo * 2 * 0.995
}

const INSCRIBED: Record<FrameShape, number> = {
  square: 1,
  rounded: computeInscribedFactor('rounded'),
  circle: computeInscribedFactor('circle'),
  squircle: computeInscribedFactor('squircle'),
  hexagon: computeInscribedFactor('hexagon'),
  star: computeInscribedFactor('star')
}

/** Where the code goes inside a `size`-square plate of the given shape.
 *
 *  `decorScale` shrinks the code to open up the ring that plate decoration
 *  draws in — a circle's inscribed square touches it at every corner, so
 *  without this there is literally no room. */
export function frameGeometry(
  shape: FrameShape,
  size: number,
  decorScale = 1,
  placement: StarPlacement = 'inside'
): { inner: number; offset: number } {
  // A star BEHIND the code is not a plate, so the inscribed square does not
  // apply and neither does decoration's ring — there is no ring, the code
  // covers the middle of the star. Both are ignored here rather than at the
  // call sites, so nothing can compute a size the renderer does not draw.
  const scale = starIsBehind(shape, placement) ? STAR_BEHIND_CODE_SCALE : INSCRIBED[shape] * decorScale
  const inner = Math.max(64, Math.round(size * scale))
  return { inner, offset: Math.round((size - inner) / 2) }
}

/** True when this shape/placement pair puts the star behind the code. One
 *  helper, because the geometry and the renderer have to agree — and 'behind'
 *  means nothing on any shape but the star. */
export function starIsBehind(shape: FrameShape, placement: StarPlacement): boolean {
  return shape === 'star' && placement === 'behind'
}

/** The shape's outline at a given plate size, in device pixels. */
function framePolygon(shape: FrameShape, size: number): [number, number][] {
  return UNIT_POLYGONS[shape].map(([x, y]) => [x * size, y * size] as [number, number])
}

/** Distance from the plate centre to the outline, along `angle` (radians, y
 *  down). Ray-casts the shape's own polygon, so a hexagon and a star answer
 *  honestly instead of being approximated by their bounding circle.
 *
 *  This is what lets plate decoration FILL a shape rather than sit in a ring
 *  inside it: generate to the corner radius and clip, and a hexagon keeps only
 *  the marks that happened to fall inside, leaving it sparse near the points
 *  and bare in the flats. */
export function frameRadiusAt(shape: FrameShape, size: number, angle: number): number {
  const pts = framePolygon(shape, size)
  const cx = size / 2
  const cy = size / 2
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  let best = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [x1, y1] = pts[j]
    const [x2, y2] = pts[i]
    // Ray (c + t·d) against segment (p1 + u·(p2-p1)), t >= 0, 0 <= u <= 1.
    const ex = x2 - x1
    const ey = y2 - y1
    const den = dx * ey - dy * ex
    if (Math.abs(den) < 1e-9) continue
    const t = ((x1 - cx) * ey - (y1 - cy) * ex) / den
    const u = ((x1 - cx) * dy - (y1 - cy) * dx) / den
    if (t >= 0 && u >= 0 && u <= 1 && t > best) best = t
  }
  return best
}

/** Trace the outline onto a 2D context (caller fills or clips). */
export function traceFrame(ctx: CanvasRenderingContext2D, shape: FrameShape, size: number): void {
  const pts = framePolygon(shape, size)
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
  ctx.closePath()
}
