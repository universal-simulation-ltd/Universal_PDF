// Finding the sheet of paper in a photo, on synthetic photos whose corners are
// known.
//
//   npm run test:scan-detect
//
// Runs under Node's type-stripping. The images are drawn here by a tiny
// polygon rasteriser at the detector's analysis size, with noise, so nothing
// depends on a canvas.
//
// Negative controls: see the bottom of this file.

import assert from 'node:assert/strict'
import test from 'node:test'

import { detectQuad, otsu } from '../src/lib/scanDetect.ts'

const W = 360
const H = 270

// Deterministic noise so a failure reproduces.
function rng(seed) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}

function inside(poly, x, y) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

function image({ bg = 60, fg = 235, sheet, extra = [], noise = 12, seed = 1, w = W, h = H }) {
  const r = rng(seed)
  const g = new Float32Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = bg
      if (sheet && inside(sheet, x + 0.5, y + 0.5)) v = fg
      for (const e of extra) if (inside(e.poly, x + 0.5, y + 0.5)) v = e.v
      g[y * w + x] = Math.max(0, Math.min(255, v + (r() - 0.5) * 2 * noise))
    }
  return g
}

// Lines of "text" inside a sheet, by bilinear interpolation of its corners.
function textLines(sheet, n = 8) {
  const at = (u, v) => {
    const t = { x: sheet[0].x + (sheet[1].x - sheet[0].x) * u, y: sheet[0].y + (sheet[1].y - sheet[0].y) * u }
    const b = { x: sheet[3].x + (sheet[2].x - sheet[3].x) * u, y: sheet[3].y + (sheet[2].y - sheet[3].y) * u }
    return { x: t.x + (b.x - t.x) * v, y: t.y + (b.y - t.y) * v }
  }
  const out = []
  for (let i = 0; i < n; i++) {
    const v0 = 0.12 + i * 0.09
    out.push({ v: 30, poly: [at(0.12, v0), at(0.85 - (i % 3) * 0.1, v0), at(0.85 - (i % 3) * 0.1, v0 + 0.03), at(0.12, v0 + 0.03)] })
  }
  return out
}

function assertNear(found, want, tol, label) {
  assert.ok(found, `${label}: nothing found`)
  for (let i = 0; i < 4; i++) {
    const d = Math.hypot(found[i].x - want[i].x, found[i].y - want[i].y)
    assert.ok(d <= tol, `${label}: corner ${i} off by ${d.toFixed(2)} px (tolerance ${tol.toFixed(2)})`)
  }
}

const SKEWED = [
  { x: 105, y: 38 },
  { x: 262, y: 52 },
  { x: 285, y: 240 },
  { x: 80, y: 226 },
]

test('finds a skewed sheet to within 1.5% of the frame', () => {
  const g = image({ sheet: SKEWED })
  assertNear(detectQuad(g, W, H), SKEWED, 0.015 * W, 'skewed')
})

test('text on the page does not throw it off', () => {
  const g = image({ sheet: SKEWED, extra: textLines(SKEWED), seed: 2 })
  assertNear(detectQuad(g, W, H), SKEWED, 0.015 * W, 'with text')
})

test('a rotated sheet comes back in reading order (TL, TR, BR, BL)', () => {
  const rotated = [
    { x: 150, y: 20 },
    { x: 300, y: 110 },
    { x: 215, y: 255 },
    { x: 60, y: 160 },
  ]
  const g = image({ sheet: rotated, seed: 3 })
  assertNear(detectQuad(g, W, H), rotated, 0.02 * W, 'rotated')
})

test('a dark sheet on a light table is found too', () => {
  const g = image({ bg: 220, fg: 70, sheet: SKEWED, seed: 4 })
  assertNear(detectQuad(g, W, H), SKEWED, 0.015 * W, 'dark sheet')
})

test('a sheet running off the edge of the photo is still found', () => {
  const off = [
    { x: 40, y: -30 },
    { x: 330, y: -10 },
    { x: 320, y: 230 },
    { x: 50, y: 250 },
  ]
  const found = detectQuad(image({ sheet: off, seed: 5 }), W, H)
  assert.ok(found, 'nothing found')
  // The bottom corners are in the frame and must be right; the top ones are
  // somewhere along the top edge.
  for (const i of [2, 3]) {
    const d = Math.hypot(found[i].x - off[i].x, found[i].y - off[i].y)
    assert.ok(d <= 0.02 * W, `corner ${i} off by ${d.toFixed(2)} px`)
  }
  // …and the top corners are on the top edge, between the sheet's sides.
  assert.ok(found[0].y < 2 && found[1].y < 2, JSON.stringify(found))
})

test('a sheet under uneven light, on a grained desk, with a shadow down one side', () => {
  // Closer to a real photo: a lamp to the left brightens desk and paper alike
  // (the right of the sheet is darker than the left of the desk would be
  // without it), the desk has a wood grain, and the sheet casts a soft shadow
  // to its right.
  const r = rng(12)
  const g = new Float32Array(W * H)
  const shadow = SKEWED.map((p) => ({ x: p.x + 9, y: p.y + 6 }))
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const light = 1.25 - (x / W) * 0.55
      const grain = 10 * Math.sin(y * 0.35 + Math.sin(x * 0.05) * 3)
      let v = (70 + grain) * light
      if (inside(shadow, x + 0.5, y + 0.5)) v *= 0.6
      if (inside(SKEWED, x + 0.5, y + 0.5)) v = 205 * light
      g[y * W + x] = Math.max(0, Math.min(255, v + (r() - 0.5) * 30))
    }
  for (const e of textLines(SKEWED)) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inside(e.poly, x + 0.5, y + 0.5)) g[y * W + x] = 40
  assertNear(detectQuad(g, W, H), SKEWED, 0.02 * W, 'uneven light')
})

test('refuses a blank photo', () => {
  assert.equal(detectQuad(image({ sheet: null, seed: 6 }), W, H), null)
})

test('refuses a bare desk lit from one side, rather than cropping to half of it', () => {
  // No paper at all; a lamp makes the left of the frame brighter than the
  // right. Otsu splits that into a light half and a dark half, and the light
  // half IS a quadrilateral — three of whose sides are the frame's edges.
  const g = new Float32Array(W * H)
  const r = rng(10)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = 200 - (x / W) * 140 + (r() - 0.5) * 20
  assert.equal(detectQuad(g, W, H), null)
})

test('low-contrast paper is found when the edge is really there', () => {
  // Off-white on white, four levels apart under ±12 noise: invisible pixel by
  // pixel, but the blur averages the noise away and leaves the edge.
  const g = image({ bg: 232, fg: 236, sheet: SKEWED, seed: 7 })
  assertNear(detectQuad(g, W, H), SKEWED, 0.02 * W, 'low contrast')
})

test('refuses a shape that is not a sheet', () => {
  // A big light disc: plenty of area, nothing like four corners.
  const disc = Array.from({ length: 40 }, (_, i) => ({
    x: 180 + 110 * Math.cos((i / 40) * 2 * Math.PI),
    y: 135 + 110 * Math.sin((i / 40) * 2 * Math.PI),
  }))
  assert.equal(detectQuad(image({ sheet: disc, seed: 8 }), W, H), null)
})

test('refuses an L-shaped region (two sheets overlapping) rather than boxing both', () => {
  const ell = [
    { x: 60, y: 30 },
    { x: 200, y: 30 },
    { x: 200, y: 140 },
    { x: 300, y: 140 },
    { x: 300, y: 245 },
    { x: 60, y: 245 },
  ]
  assert.equal(detectQuad(image({ sheet: ell, seed: 11 }), W, H), null)
})

test('refuses a speck', () => {
  const small = [
    { x: 170, y: 120 },
    { x: 200, y: 120 },
    { x: 200, y: 150 },
    { x: 170, y: 150 },
  ]
  assert.equal(detectQuad(image({ sheet: small, seed: 9 }), W, H), null)
})

test('Otsu splits two populations between them', () => {
  const v = [...Array(500).fill(50), ...Array(500).fill(200)]
  const t = otsu(v)
  assert.ok(t >= 50 && t < 200, `threshold ${t}`)
})

// Negative controls (2026-10-03, run), each a one-line edit to scanDetect.ts,
// reverted afterwards:
//   • `refineSides` skipped (corners straight from the hull): the skewed,
//     text, rotated and dark-sheet tests go red — blur rounds the corners by
//     more than the tolerance, which is what the re-fit is for.
//   • The three-border-sides rule removed: "refuses a bare desk lit from one
//     side" goes red.
//   • The overlap (IoU) check removed: "refuses a shape that is not a sheet"
//     and "refuses an L-shaped region" go red. A plain area ratio, the first
//     version of this check, let the L through: cutting its hull to four
//     corners leaves a quad of about the L's own area.
//   • The dark-sheet pass removed: "a dark sheet on a light table" goes red.
//   • Overlap measured on the region WITH its holes: "text on the page does
//     not throw it off" goes red.
