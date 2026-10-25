// Marks turn with their page (the phone's Pages page ▸ Rotate, 2026-10-25).
//
//   npm run test:rotate-annotations
//
// Runs under Node's type-stripping; `rotateAnnotations.ts` imports only types.
// The browser half (the page viewer, the saved PDF's /Rotate) is
// e2e/phone-pages.e2e.mjs.

import assert from 'node:assert/strict'
import test from 'node:test'

import { turnAnnotations } from '../src/lib/rotateAnnotations.ts'

const A4 = { w: 595, h: 842 }

test('a drawn line: every point goes a quarter clockwise', () => {
  const [a] = turnAnnotations([{ id: 'd', type: 'draw', pageIndex: 0, points: [0, 0, 100, 50], color: '#000', strokeWidth: 2 }], 1, A4)
  // (x, y) → (H − y, x)
  assert.deepEqual(a.points, [842, 0, 792, 100])
})

test('a box that turns: anchor moves, rotation goes up by 90', () => {
  const [a] = turnAnnotations([{ id: 'r', type: 'rect', pageIndex: 0, x: 10, y: 20, width: 100, height: 40, color: '#000' }], 1, A4)
  assert.equal(a.x, 822)
  assert.equal(a.y, 10)
  assert.equal(a.rotation, 90)
  assert.equal(a.width, 100)
})

test('four quarters is no turn at all, and two quarters is a half turn', () => {
  const r = { id: 'r', type: 'rect', pageIndex: 0, x: 10, y: 20, width: 100, height: 40, color: '#000', rotation: 0 }
  const [same] = turnAnnotations([r], 4, A4)
  assert.deepEqual(same, r)
  const [half] = turnAnnotations([r], 2, A4)
  // (x, y) → (W − x, H − y), turned 180 about its own corner.
  assert.equal(half.x, 585)
  assert.equal(half.y, 822)
  assert.equal(half.rotation, 180)
})

test('an ellipse turns about its middle', () => {
  const [a] = turnAnnotations([{ id: 'e', type: 'ellipse', pageIndex: 0, x: 0, y: 0, width: 100, height: 40, color: '#000' }], 1, A4)
  // middle (50, 20) → (822, 50)
  assert.equal(a.x + a.width / 2, 822)
  assert.equal(a.y + a.height / 2, 50)
  assert.equal(a.rotation, 90)
})

test('a black-out box still covers the same area, never turned', () => {
  const [a] = turnAnnotations([{ id: 'x', type: 'redact', pageIndex: 0, x: 10, y: 20, width: 100, height: 40 }], 1, A4)
  assert.deepEqual([a.x, a.y, a.width, a.height], [782, 10, 40, 100])
  assert.equal(a.rotation, undefined)
})

test('a "Sign here" box stays upright, its middle on the same spot', () => {
  const [a] = turnAnnotations([{ id: 's', type: 'sigfield', pageIndex: 0, x: 100, y: 700, width: 200, height: 60 }], 1, A4)
  assert.equal(a.width, 200)
  assert.equal(a.height, 60)
  // middle (200, 730) → (112, 200)
  assert.equal(a.x + 100, 112)
  assert.equal(a.y + 30, 200)
})

test('a page number stays upright at the foot of the turned page', () => {
  const pn = {
    id: 'n', type: 'text', pageIndex: 0, x: 290, y: 800, text: '1', color: '#000', fontSize: 10,
    pageNumber: { template: '{n}', align: 'centre', anchorX: 297.5 },
  }
  const [a] = turnAnnotations([pn], 1, A4)
  assert.equal(a.rotation, undefined)
  // The turned page is 842 wide and 595 tall: centred, the same height off the foot.
  assert.equal(a.pageNumber.anchorX, 421)
  assert.equal(a.x, 290 + (421 - 297.5))
  assert.equal(a.y, 595 - 42)
})

test('a right-aligned page number keeps its margin from the right', () => {
  const pn = {
    id: 'n', type: 'text', pageIndex: 0, x: 540, y: 800, text: '1', color: '#000', fontSize: 10,
    pageNumber: { template: '{n}', align: 'right', anchorX: 559 },
  }
  const [a] = turnAnnotations([pn], 1, A4)
  assert.equal(a.pageNumber.anchorX, 842 - 36)
})
