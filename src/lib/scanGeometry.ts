// The arithmetic behind "photo of a page → flat page". Imports nothing, so
// `npm run test:scan-geometry` runs it under Node's type-stripping.
//
// A photo of a sheet of paper is the sheet seen in perspective: its four
// corners land on some quadrilateral, not a rectangle. Flattening it is one
// projective transform (a homography) from the output rectangle back to that
// quadrilateral; every output pixel asks it "where in the photo am I?" and
// reads the colour there. That inverse direction — output → photo — is why
// `homography` is called with the rectangle first: it leaves no holes, which
// mapping photo pixels forwards would.

export interface Point {
  x: number
  y: number
}

/** Corners in reading order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point]

/** A 3×3 matrix in row-major order, with the last element normalised to 1. */
export type Homography = [number, number, number, number, number, number, number, number, number]

/**
 * The homography H with H·from[i] ∝ to[i] for each of the four corners.
 *
 * Eight unknowns (h33 is fixed at 1), two equations per point pair, solved by
 * Gaussian elimination with partial pivoting. Throws if the system is singular.
 *
 * ⚠️ That is NOT a check on the outline. With `to` squashed so three corners
 * sit on one line the system usually still solves — to a transform that
 * flattens the page onto that line. Ruling out such an outline is the
 * caller's job: the corner editor refuses anything `isConvexQuad` rejects.
 */
export function homography(from: Quad, to: Quad): Homography {
  const a: number[][] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i]
    const { x: u, y: v } = to[i]
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y, v])
  }
  const n = 8
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r
    }
    if (Math.abs(a[pivot][col]) < 1e-12) throw new Error('Degenerate quadrilateral')
    ;[a[col], a[pivot]] = [a[pivot], a[col]]
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = a[r][col] / a[col][col]
      if (f === 0) continue
      for (let c = col; c <= n; c++) a[r][c] -= f * a[col][c]
    }
  }
  const h = a.map((row, i) => row[n] / row[i])
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1]
}

/** Apply H to a point (with the projective divide). */
export function project(h: Homography, x: number, y: number): Point {
  const w = h[6] * x + h[7] * y + h[8]
  return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w }
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * The pixel size of the flattened page.
 *
 * Each side is the LONGER of the two opposite edges: perspective only ever
 * shrinks the far edge, so the near one is the closest the photo comes to the
 * page's real resolution and taking it loses no detail. Capped at `maxEdge` on
 * the long side (a 48 MP photo of a receipt does not need to be a 48 MP page),
 * keeping the aspect ratio.
 */
export function outputSize(q: Quad, maxEdge: number): { width: number; height: number } {
  let width = Math.max(dist(q[0], q[1]), dist(q[3], q[2]))
  let height = Math.max(dist(q[0], q[3]), dist(q[1], q[2]))
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  width = Math.max(1, Math.round(width * scale))
  height = Math.max(1, Math.round(height * scale))
  return { width, height }
}

/** Is the quad a real, non-self-intersecting, convex page outline? */
export function isConvexQuad(q: Quad): boolean {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = q[i]
    const b = q[(i + 1) % 4]
    const c = q[(i + 2) % 4]
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (Math.abs(cross) < 1e-9) return false
    const s = Math.sign(cross)
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}

/** The starting outline on a fresh photo: the whole frame, inset a little so
 *  every handle is visibly ON the picture rather than lost in its border. */
export function defaultQuad(width: number, height: number, inset = 0.06): Quad {
  const dx = width * inset
  const dy = height * inset
  return [
    { x: dx, y: dy },
    { x: width - dx, y: dy },
    { x: width - dx, y: height - dy },
    { x: dx, y: height - dy },
  ]
}

/** The whole photo, corner to corner — "don't crop". */
export function fullQuad(width: number, height: number): Quad {
  return defaultQuad(width, height, 0)
}

// ── Paper ────────────────────────────────────────────────────────────────────

export type Paper = 'a4' | 'letter'

/** Paper size in PDF points, portrait. */
export const PAPER_PT: Record<Paper, { w: number; h: number }> = {
  a4: { w: 595.28, h: 841.89 },
  letter: { w: 612, h: 792 },
}

// The places where Letter, not A4, is what comes out of the printer. Most of
// the Americas plus the Philippines; everywhere else is A4.
const LETTER_REGIONS = new Set(['US', 'CA', 'MX', 'CL', 'CO', 'VE', 'PH', 'PR', 'GT', 'CR', 'PA', 'DO', 'SV'])

/** The paper a scan defaults to, from a BCP 47 tag like `en-US` or `fr-CA`. */
export function paperForLocale(tag: string | undefined | null): Paper {
  const region = (tag ?? '').split(/[-_]/).slice(1).find((p) => /^[A-Za-z]{2}$/.test(p))
  return region && LETTER_REGIONS.has(region.toUpperCase()) ? 'letter' : 'a4'
}

/**
 * The PDF page size, in points, for a scanned image of `width`×`height` pixels.
 *
 * The image is fitted INSIDE the paper (portrait or landscape, whichever the
 * image is) and the page is then exactly the fitted image — no white margins
 * added. A scan of a full sheet therefore comes out at that sheet's size, and
 * a receipt comes out as a receipt-shaped page the height of the sheet, which
 * prints at a readable size instead of as a one-metre-tall page (an image
 * embedded at 1 px = 1 pt, the rule `imagesToPdf` uses, makes a 3000 px phone
 * scan 106 cm tall).
 */
export function scanPageSize(width: number, height: number, paper: Paper): { w: number; h: number } {
  const p = PAPER_PT[paper]
  const box = width > height ? { w: p.h, h: p.w } : p
  const scale = Math.min(box.w / width, box.h / height)
  return { w: width * scale, h: height * scale }
}

/** `Scan 2026-10-03 14.05.pdf`, in local time. Dots, not colons, in the time:
 *  a colon is not allowed in a Windows filename, nor shown as one on macOS. */
export function scanFileName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `Scan ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.pdf`
}
