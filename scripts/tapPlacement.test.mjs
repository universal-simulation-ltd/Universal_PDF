// Where a tapped shape lands — and the redaction a tap now drops.
//
//   npm run test:tap-placement
//
// Runs under Node's type-stripping; `tapPlacement.ts` imports nothing.
//
// What is pinned (James, 2026-09-14: "Tap drops a box"): Redact was the last
// drag tool that threw a single tap away. A tap now drops a redaction sized for
// the job — one line of body text tall, a word or two wide, in page POINTS so
// it covers the same text at any zoom — centred on the tap and pulled back onto
// the page near an edge. The browser half (it lands, is selected, resizes, and
// burns in on export) is e2e/shape-tap.e2e.mjs.
//
// Negative control (2026-09-14, run): with `centreOnTap`'s clamp removed (the
// box simply centred on the tap), both flush-with-the-edge tests and the
// Box/Circle equivalence test go red and the other four stay green; with
// TAP_REDACT_SIZE_PT set to the Box tool's 180x120 only the size test goes red.

import assert from 'node:assert/strict'
import test from 'node:test'

import { TAP_REDACT_SIZE_PT, centreOnTap, tapRedactBox } from '../src/lib/tapPlacement.ts'

const A4 = { w: 595, h: 842 }

test('a tapped redaction is a line of body text tall and a word or two wide', () => {
  const b = tapRedactBox(300, 400, A4.w, A4.h)
  assert.equal(b.width, TAP_REDACT_SIZE_PT.width)
  assert.equal(b.height, TAP_REDACT_SIZE_PT.height)
  // 11–12pt body text is set on ~14pt lines; much taller and a tap on one line
  // blacks out its neighbours too.
  assert.ok(b.height >= 14 && b.height <= 20, `height ${b.height}`)
  // A word or two of that text — not a sliver, not half the line.
  assert.ok(b.width >= 48 && b.width <= 120, `width ${b.width}`)
})

test('it is centred on the tap', () => {
  const b = tapRedactBox(300, 400, A4.w, A4.h)
  assert.equal(b.x + b.width / 2, 300)
  assert.equal(b.y + b.height / 2, 400)
})

test('a tap near the right or bottom edge is flush with it, not hanging off', () => {
  const r = tapRedactBox(A4.w - 3, 400, A4.w, A4.h)
  assert.equal(r.x + r.width, A4.w)
  const b = tapRedactBox(300, A4.h - 2, A4.w, A4.h)
  assert.equal(b.y + b.height, A4.h)
})

test('a tap near the left or top edge is flush with it', () => {
  const b = tapRedactBox(4, 3, A4.w, A4.h)
  assert.equal(b.x, 0)
  assert.equal(b.y, 0)
  assert.equal(b.width, TAP_REDACT_SIZE_PT.width)
  assert.equal(b.height, TAP_REDACT_SIZE_PT.height)
})

test('an edge tap is moved only as far as it has to be', () => {
  // Half the default width from the right edge is already a fit — no nudge.
  const half = TAP_REDACT_SIZE_PT.width / 2
  const b = tapRedactBox(A4.w - half, 400, A4.w, A4.h)
  assert.equal(b.x + b.width / 2, A4.w - half)
})

test('a page smaller than the default gets a box the size of the page', () => {
  const b = tapRedactBox(20, 5, 40, 10)
  assert.deepEqual(b, { x: 0, y: 0, width: 40, height: 10 })
})

test('centreOnTap is exactly the placement Box and Circle taps always had', () => {
  // The clamp was lifted out of AnnotationLayer's tapBox into the shared
  // helper; this is the old inline formula, so the refactor cannot move them.
  const old = (v, size, page) => Math.min(Math.max(v - size / 2, 0), Math.max(page - size, 0))
  for (const [x, y] of [[300, 400], [2, 2], [A4.w - 1, A4.h - 1], [A4.w / 2, 30]]) {
    const b = centreOnTap(x, y, 150, 100, A4.w, A4.h)
    assert.deepEqual(b, { x: old(x, 150, A4.w), y: old(y, 100, A4.h), width: 150, height: 100 })
  }
})
