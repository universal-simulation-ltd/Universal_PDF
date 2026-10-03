// Find the sheet of paper in a photo. Imports nothing but types and geometry,
// so `npm run test:scan-detect` runs it under Node's type-stripping.
//
// No computer-vision library. OpenCV.js would do this with one call and ~8 MB
// of WebAssembly, which this app would have to serve itself (no third-party
// CDNs for engines — Docs_UNI_SIM/next-products.md). The case that matters is
// narrow enough to solve directly: a sheet of paper, lighter than what it is
// lying on, photographed from roughly above. So:
//
//   1. Blur, then split the picture into light and dark with Otsu's threshold
//      (the cut that best separates the two brightness populations).
//   2. Take the largest connected light region — the paper. Text and lines on
//      it are holes inside the region and do not matter, because:
//   3. its outline is reduced to a convex hull and then to the four corners
//      that keep the most of its area — and the region must fill that quad
//      (intersection over union), or it was not a sheet, and
//   4. each side is re-fitted as a straight line through the region's edge
//      pixels and the corners re-taken where neighbouring sides meet, which
//      undoes the rounding the blur gave the corners.
//
// It refuses rather than guesses: a region that is too small, fills the whole
// frame, or is not shaped like a quadrilateral returns null, and the editor
// says it could not find the page. A wrong crop presented as found is worse
// than an honest "drag the corners yourself".
//
// ⚠️ Known blind spot: a sheet with no visible edge — white paper on a white
// desk under flat light, or a page held against something of its own colour.
// There is no light/dark split to find, so it returns null and the user crops
// by hand, which is the manual crop the editor always offers anyway. (A faint
// edge IS found: the blur averages sensor noise away. scanDetect.test.mjs
// pins both.)

import { isConvexQuad, type Point, type Quad } from './scanGeometry.ts'

/** Analysis size: the long side the photo is shrunk to before any of this. */
export const DETECT_EDGE = 360

const MIN_AREA = 0.12 // of the frame
const MAX_AREA = 0.97
// How well the four corners describe the region: intersection over union of
// the quad and the region (holes filled). A sheet scores ~0.97+; an L, a disc
// or two overlapping sheets cannot get near it with four corners.
const MIN_IOU = 0.9

/**
 * The page's corners in a `width`×`height` greyscale image (0–255, row-major),
 * TL, TR, BR, BL, in that image's pixel coordinates — or null if no page-like
 * region was found.
 */
export function detectQuad(grey: ArrayLike<number>, width: number, height: number): Quad | null {
  const blurred = boxBlur(boxBlur(Float32Array.from(grey), width, height, 2), width, height, 2)
  const t = otsu(blurred)
  let best: { quad: Quad; score: number } | null = null
  // Paper is usually the light class; a dark sheet on a light table is the
  // other way round, and costs one more pass to allow for.
  for (const light of [true, false]) {
    const mask = new Uint8Array(width * height)
    for (let i = 0; i < mask.length; i++) mask[i] = (blurred[i] > t) === light ? 1 : 0
    const opened = dilate(erode(mask, width, height, 2), width, height, 2)
    const found = largestComponent(opened, width, height)
    if (!found) continue
    const quad = quadFromRegion(found.pixels, found.area, width, height)
    if (quad && (!best || quad.score > best.score)) best = quad
  }
  return best?.quad ?? null
}

// ── Pixels ───────────────────────────────────────────────────────────────────

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0
      let n = 0
      for (let k = -r; k <= r; k++) {
        const xx = x + k
        if (xx >= 0 && xx < w) {
          s += src[y * w + xx]
          n++
        }
      }
      tmp[y * w + x] = s / n
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0
      let n = 0
      for (let k = -r; k <= r; k++) {
        const yy = y + k
        if (yy >= 0 && yy < h) {
          s += tmp[yy * w + x]
          n++
        }
      }
      out[y * w + x] = s / n
    }
  }
  return out
}

/** Otsu's threshold over a 256-bin histogram. */
export function otsu(v: ArrayLike<number>): number {
  const hist = new Float64Array(256)
  for (let i = 0; i < v.length; i++) hist[Math.max(0, Math.min(255, Math.round(v[i])))]++
  const total = v.length
  let sumAll = 0
  for (let i = 0; i < 256; i++) sumAll += i * hist[i]
  let wB = 0
  let sumB = 0
  let best = 0
  let bestT = 127
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sumAll - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > best) {
      best = between
      bestT = t
    }
  }
  return bestT
}

function morph(mask: Uint8Array, w: number, h: number, r: number, keep: 0 | 1): Uint8Array {
  // Separable square structuring element: rows, then columns.
  const pass = (src: Uint8Array, horizontal: boolean) => {
    const out = new Uint8Array(src.length)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = keep === 1 ? 1 : 0
        for (let k = -r; k <= r; k++) {
          const xx = horizontal ? x + k : x
          const yy = horizontal ? y : y + k
          // Outside the frame reads as `keep`, so it never decides anything.
          const s = xx < 0 || yy < 0 || xx >= w || yy >= h ? keep : src[yy * w + xx]
          if (keep === 1 ? s === 0 : s === 1) {
            v = 1 - keep
            break
          }
        }
        out[y * w + x] = v
      }
    }
    return out
  }
  return pass(pass(mask, true), false)
}
// Erosion keeps a pixel only if its whole neighbourhood is set; outside the
// frame counts as set, so a sheet running off the edge is not eaten away there.
const erode = (m: Uint8Array, w: number, h: number, r: number) => morph(m, w, h, r, 1)
const dilate = (m: Uint8Array, w: number, h: number, r: number) => morph(m, w, h, r, 0)

/** The largest 4-connected set region, as a label image row-extent list. */
function largestComponent(
  mask: Uint8Array,
  w: number,
  h: number,
): { pixels: Uint8Array; area: number } | null {
  const label = new Int32Array(w * h)
  const stack = new Int32Array(w * h)
  let next = 0
  let bestLabel = 0
  let bestArea = 0
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start]) continue
    next++
    let top = 0
    stack[top++] = start
    label[start] = next
    let area = 0
    while (top > 0) {
      const p = stack[--top]
      area++
      const x = p % w
      const y = (p - x) / w
      if (x > 0 && mask[p - 1] && !label[p - 1]) (label[p - 1] = next), (stack[top++] = p - 1)
      if (x < w - 1 && mask[p + 1] && !label[p + 1]) (label[p + 1] = next), (stack[top++] = p + 1)
      if (y > 0 && mask[p - w] && !label[p - w]) (label[p - w] = next), (stack[top++] = p - w)
      if (y < h - 1 && mask[p + w] && !label[p + w]) (label[p + w] = next), (stack[top++] = p + w)
    }
    if (area > bestArea) {
      bestArea = area
      bestLabel = next
    }
  }
  if (!bestLabel) return null
  const pixels = new Uint8Array(w * h)
  for (let i = 0; i < pixels.length; i++) pixels[i] = label[i] === bestLabel ? 1 : 0
  return { pixels, area: bestArea }
}

// ── Shape ────────────────────────────────────────────────────────────────────

function quadFromRegion(
  region: Uint8Array,
  area: number,
  w: number,
  h: number,
): { quad: Quad; score: number } | null {
  const frame = w * h
  if (area < MIN_AREA * frame || area > MAX_AREA * frame) return null

  // The region's left and right edge in every row, and top and bottom in every
  // column: a dense set of outline points, cheap to collect.
  const edge: Point[] = []
  // The region with its holes filled (row extents), which is what the overlap
  // test below compares with the quad: text on the page punches holes in the
  // light region, and they say nothing about whether its OUTLINE is a sheet.
  let solid = 0
  const rowL = new Int32Array(h).fill(-1)
  const rowR = new Int32Array(h).fill(-1)
  for (let y = 0; y < h; y++) {
    let l = -1
    let r = -1
    for (let x = 0; x < w; x++) {
      if (region[y * w + x]) {
        if (l < 0) l = x
        r = x
      }
    }
    if (l >= 0) {
      edge.push({ x: l, y: y + 0.5 }, { x: r + 1, y: y + 0.5 })
      solid += r + 1 - l
      rowL[y] = l
      rowR[y] = r
    }
  }
  for (let x = 0; x < w; x++) {
    let t = -1
    let b = -1
    for (let y = 0; y < h; y++) {
      if (region[y * w + x]) {
        if (t < 0) t = y
        b = y
      }
    }
    if (t >= 0) edge.push({ x: x + 0.5, y: t }, { x: x + 0.5, y: b + 1 })
  }

  const hull = convexHull(edge)
  if (hull.length < 4) return null
  let quad = reduceToFour(hull)
  if (!quad) return null
  quad = refineSides(quad, edge, Math.max(w, h)) ?? quad
  quad = order(quad)
  if (!isConvexQuad(quad)) return null

  const qa = polygonArea(quad)
  if (qa > MAX_AREA * frame) return null
  const iou = overlap(quad, rowL, rowR, solid, w, h)
  if (iou < MIN_IOU) return null
  // Three sides lying along the frame's edges is not a sheet that runs off
  // the photo (that loses one side, two at a corner): it is half the frame,
  // split off by uneven light or a desk edge.
  const onBorder = (a: Point, b: Point) => {
    const e = 2
    return (
      (a.x < e && b.x < e) ||
      (a.y < e && b.y < e) ||
      (a.x > w - e && b.x > w - e) ||
      (a.y > h - e && b.y > h - e)
    )
  }
  let borderSides = 0
  for (let i = 0; i < 4; i++) if (onBorder(quad[i], quad[(i + 1) % 4])) borderSides++
  if (borderSides >= 3) return null
  return { quad, score: solid * iou }
}

/**
 * Intersection over union of a convex quad and a region given as one run of
 * pixels per row (`rowL[y]`..`rowR[y]`, -1 for an empty row), counted at pixel
 * centres.
 */
function overlap(q: Quad, rowL: Int32Array, rowR: Int32Array, solid: number, w: number, h: number): number {
  let inQuad = 0
  let both = 0
  const y0 = Math.max(0, Math.floor(Math.min(q[0].y, q[1].y, q[2].y, q[3].y)))
  const y1 = Math.min(h - 1, Math.ceil(Math.max(q[0].y, q[1].y, q[2].y, q[3].y)))
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5
    // The quad's span on this row: intersect its four edges with the line.
    let lo = Infinity
    let hi = -Infinity
    for (let i = 0; i < 4; i++) {
      const a = q[i]
      const b = q[(i + 1) % 4]
      if ((a.y <= cy && b.y > cy) || (b.y <= cy && a.y > cy)) {
        const x = a.x + ((cy - a.y) / (b.y - a.y)) * (b.x - a.x)
        lo = Math.min(lo, x)
        hi = Math.max(hi, x)
      }
    }
    if (lo > hi) continue
    // Pixel centres x + 0.5 inside [lo, hi].
    const qa = Math.max(0, Math.ceil(lo - 0.5))
    const qb = Math.min(w - 1, Math.floor(hi - 0.5))
    if (qb < qa) continue
    inQuad += qb - qa + 1
    if (rowL[y] >= 0) {
      const s = Math.max(qa, rowL[y])
      const e = Math.min(qb, rowR[y])
      if (e >= s) both += e - s + 1
    }
  }
  return both / (inQuad + solid - both)
}

/** Andrew's monotone chain. Counter-clockwise in a y-down frame's terms. */
function convexHull(points: Point[]): Point[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Point[] = []
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop()
    lower.push(q)
  }
  const upper: Point[] = []
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop()
    upper.push(q)
  }
  upper.pop()
  lower.pop()
  return lower.concat(upper)
}

const triArea = (a: Point, b: Point, c: Point) => Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2

/** Drop the hull vertex that costs the least area until four are left. */
function reduceToFour(hull: Point[]): Quad | null {
  const p = [...hull]
  while (p.length > 4) {
    let min = Infinity
    let at = -1
    for (let i = 0; i < p.length; i++) {
      const a = triArea(p[(i - 1 + p.length) % p.length], p[i], p[(i + 1) % p.length])
      if (a < min) {
        min = a
        at = i
      }
    }
    p.splice(at, 1)
  }
  return p.length === 4 ? (p as Quad) : null
}

function polygonArea(q: Point[]): number {
  let s = 0
  for (let i = 0; i < q.length; i++) {
    const a = q[i]
    const b = q[(i + 1) % q.length]
    s += a.x * b.y - b.x * a.y
  }
  return Math.abs(s) / 2
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/**
 * Re-fit each side through the outline points near its middle (total least
 * squares) and re-take the corners where neighbouring sides cross. The ends of
 * each side are left out: that is where blur and opening rounded the corner.
 */
function refineSides(q: Quad, edge: Point[], size: number): Quad | null {
  // Generous: when blur rounds a corner into two hull vertices, dropping the
  // wrong one leaves a side that cuts a few pixels inside the real edge, and
  // a tight band would then catch none of the edge it is meant to re-fit.
  const tol = Math.max(3, size * 0.03)
  const lines: { p: Point; d: Point }[] = []
  for (let i = 0; i < 4; i++) {
    const a = q[i]
    const b = q[(i + 1) % 4]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    const pts = edge.filter((p) => {
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
      return t > 0.15 && t < 0.85 && distToSegment(p, a, b) < tol
    })
    if (pts.length < 6) return null
    let mx = 0
    let my = 0
    for (const p of pts) (mx += p.x), (my += p.y)
    mx /= pts.length
    my /= pts.length
    let sxx = 0
    let sxy = 0
    let syy = 0
    for (const p of pts) {
      sxx += (p.x - mx) ** 2
      sxy += (p.x - mx) * (p.y - my)
      syy += (p.y - my) ** 2
    }
    const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy)
    lines.push({ p: { x: mx, y: my }, d: { x: Math.cos(angle), y: Math.sin(angle) } })
  }
  const out: Point[] = []
  for (let i = 0; i < 4; i++) {
    // Corner i is where side i-1 (ending at it) meets side i (starting at it).
    const l1 = lines[(i + 3) % 4]
    const l2 = lines[i]
    const den = l1.d.x * l2.d.y - l1.d.y * l2.d.x
    if (Math.abs(den) < 1e-6) return null
    const t = ((l2.p.x - l1.p.x) * l2.d.y - (l2.p.y - l1.p.y) * l2.d.x) / den
    const c = { x: l1.p.x + t * l1.d.x, y: l1.p.y + t * l1.d.y }
    // A refit that throws a corner far from where the hull put it has fitted
    // something other than the side; keep the hull's corner.
    if (Math.hypot(c.x - q[i].x, c.y - q[i].y) > size * 0.08) return null
    out.push(c)
  }
  return out as Quad
}

/** TL, TR, BR, BL: clockwise on screen, starting nearest the top-left. */
function order(q: Quad): Quad {
  const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4
  const cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4
  const byAngle = [...q].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx))
  let start = 0
  for (let i = 1; i < 4; i++) if (byAngle[i].x + byAngle[i].y < byAngle[start].x + byAngle[start].y) start = i
  return [0, 1, 2, 3].map((k) => byAngle[(start + k) % 4]) as Quad
}
