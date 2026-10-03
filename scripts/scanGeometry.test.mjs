// The arithmetic behind Scan to PDF: flattening a photographed page, sizing
// the result, and the paper it defaults to.
//
//   npm run test:scan-geometry
//
// Runs under Node's type-stripping; `scanGeometry.ts` imports nothing. The
// browser half (the corner editor, the pixels, the PDF it opens) is
// e2e/photo-scan.e2e.mjs.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PAPER_PT,
  defaultQuad,
  homography,
  isConvexQuad,
  outputSize,
  paperForLocale,
  project,
  scanFileName,
  scanPageSize,
} from '../src/lib/scanGeometry.ts'

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`)

const RECT = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 140 },
  { x: 0, y: 140 },
]
// A page photographed from below and to one side: the top edge is shorter.
const SKEW = [
  { x: 210, y: 95 },
  { x: 640, y: 120 },
  { x: 700, y: 760 },
  { x: 150, y: 720 },
]

test('the homography takes every corner exactly to its partner', () => {
  const h = homography(RECT, SKEW)
  for (let i = 0; i < 4; i++) {
    const p = project(h, RECT[i].x, RECT[i].y)
    close(p.x, SKEW[i].x)
    close(p.y, SKEW[i].y)
  }
})

test('straight lines stay straight: the centre of the page maps to where the diagonals cross', () => {
  const h = homography(RECT, SKEW)
  const c = project(h, 50, 70)
  // Intersection of SKEW's two diagonals.
  const [a, b, cc, d] = SKEW
  const den = (a.x - cc.x) * (b.y - d.y) - (a.y - cc.y) * (b.x - d.x)
  const t = ((a.x - b.x) * (b.y - d.y) - (a.y - b.y) * (b.x - d.x)) / den
  close(c.x, a.x + t * (cc.x - a.x), 1e-6)
  close(c.y, a.y + t * (cc.y - a.y), 1e-6)
})

test('the identity quad gives the identity transform', () => {
  const h = homography(RECT, RECT)
  const p = project(h, 37, 91)
  close(p.x, 37)
  close(p.y, 91)
})

test('three corners in a line is not a page', () => {
  // The homography would happily solve this (see its comment), so the outline
  // check is what has to refuse it.
  assert.equal(
    isConvexQuad([
      { x: 0, y: 0 },
      { x: 50, y: 50 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]),
    false,
  )
})

test('output size takes the longer of each pair of opposite edges', () => {
  const s = outputSize(SKEW, 10_000)
  const top = Math.hypot(640 - 210, 120 - 95)
  const bottom = Math.hypot(700 - 150, 760 - 720)
  const left = Math.hypot(150 - 210, 720 - 95)
  const right = Math.hypot(700 - 640, 760 - 120)
  assert.equal(s.width, Math.round(Math.max(top, bottom)))
  assert.equal(s.height, Math.round(Math.max(left, right)))
})

test('output size is capped on the long side and keeps its shape', () => {
  const big = [
    { x: 0, y: 0 },
    { x: 6000, y: 0 },
    { x: 6000, y: 8000 },
    { x: 0, y: 8000 },
  ]
  const s = outputSize(big, 3000)
  assert.equal(s.height, 3000)
  assert.equal(s.width, 2250)
})

test('a crossed outline is not convex; the default outline is', () => {
  assert.equal(isConvexQuad(defaultQuad(800, 600)), true)
  assert.equal(isConvexQuad(SKEW), true)
  const bowtie = [SKEW[0], SKEW[2], SKEW[1], SKEW[3]]
  assert.equal(isConvexQuad(bowtie), false)
})

test('a full-sheet scan comes out at the sheet size, not 1 px = 1 pt', () => {
  // A 2480×3508 scan is A4 at 300 dpi; at 1 px = 1 pt it would be a 124 cm page.
  const a4 = scanPageSize(2480, 3508, 'a4')
  close(a4.w, PAPER_PT.a4.w, 0.5)
  close(a4.h, PAPER_PT.a4.h, 0.5)
})

test('a landscape scan is fitted to landscape paper', () => {
  const s = scanPageSize(3508, 2480, 'a4')
  close(s.w, PAPER_PT.a4.h, 0.5)
  close(s.h, PAPER_PT.a4.w, 0.5)
})

test('a receipt keeps its shape and is no taller than the sheet', () => {
  const s = scanPageSize(600, 2400, 'letter')
  close(s.h, PAPER_PT.letter.h, 1e-6)
  close(s.w / s.h, 600 / 2400, 1e-9)
})

test('Letter in the Americas, A4 everywhere else', () => {
  assert.equal(paperForLocale('en-US'), 'letter')
  assert.equal(paperForLocale('fr-CA'), 'letter')
  assert.equal(paperForLocale('es-MX'), 'letter')
  assert.equal(paperForLocale('en-GB'), 'a4')
  assert.equal(paperForLocale('pt-BR'), 'a4')
  assert.equal(paperForLocale('zh-Hant-TW'), 'a4')
  assert.equal(paperForLocale('en'), 'a4')
  assert.equal(paperForLocale(undefined), 'a4')
})

test('the file name sorts by date and has no colon in it', () => {
  const n = scanFileName(new Date(2026, 9, 3, 9, 5))
  assert.equal(n, 'Scan 2026-10-03 09.05.pdf')
  assert.ok(!n.includes(':'))
})
