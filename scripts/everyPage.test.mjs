// "Put on every page" for a signature, stamp or picture.
//
//   npm run test:every-page
//
// Runs under Node's type-stripping; `everyPage.ts` imports only types.
//
// What is pinned (James, 2026-10-18: "on signatures and stamps give the option
// to place them on every page (they could pick a draft stamp etc)"): one copy
// per other page, the same distance from the nearest edges (so a signature at
// the foot of a Letter page lands at the foot of an A4 one), kept on a smaller
// page, and nothing added twice. The browser half is e2e/every-page.e2e.mjs.

import assert from 'node:assert/strict'
import test from 'node:test'

import { copiesForEveryPage, copiesOnOtherPages, placeOnPage } from '../src/lib/everyPage.ts'

const A4 = { w: 595, h: 842 }
const LETTER = { w: 612, h: 792 }
const SMALL = { w: 300, h: 400 }
let n = 0
const id = () => `copy-${++n}`
const stamp = { id: 's', type: 'image', pageIndex: 0, x: 40, y: 30, width: 120, height: 50, src: 'data:image/png;base64,AAA' }

test('one copy on every other page, each its own annotation', () => {
  const out = copiesForEveryPage(stamp, [A4, A4, A4, A4], [stamp], id)
  assert.deepEqual(out.map((c) => c.pageIndex), [1, 2, 3])
  assert.equal(new Set(out.map((c) => c.id)).size, 3)
  assert.ok(out.every((c) => c.id !== stamp.id && c.src === stamp.src && c.width === 120 && c.height === 50))
})

test('the same place on a page of the same size', () => {
  const [c] = copiesForEveryPage(stamp, [A4, A4], [stamp], id)
  assert.deepEqual([c.x, c.y], [40, 30])
})

test('kept the same distance from the nearest edges on a different page size', () => {
  // A signature at the bottom right of a Letter page…
  const sig = { ...stamp, x: 612 - 36 - 150, y: 792 - 40 - 60, width: 150, height: 60 }
  const p = placeOnPage(sig, LETTER, A4)
  // …is 36 from the right and 40 from the bottom of the A4 page too.
  assert.equal(595 - (p.x + 150), 36)
  assert.equal(842 - (p.y + 60), 40)
  // Top left stays measured from the top left.
  assert.deepEqual(placeOnPage(stamp, LETTER, A4), { x: 40, y: 30 })
})

test('pulled back onto a smaller page', () => {
  const wide = { ...stamp, x: 200, y: 600, width: 200, height: 80 }
  const p = placeOnPage(wide, A4, SMALL)
  assert.ok(p.x >= 0 && p.x + 200 <= SMALL.w, JSON.stringify(p))
  assert.ok(p.y >= 0 && p.y + 80 <= SMALL.h, JSON.stringify(p))
})

test('a page that already has it in that place gets nothing', () => {
  const first = copiesForEveryPage(stamp, [A4, A4, A4], [stamp], id)
  const again = copiesForEveryPage(stamp, [A4, A4, A4], [stamp, ...first], id)
  assert.equal(again.length, 0)
})

test('a one-page document has nowhere to copy to', () => {
  assert.equal(copiesForEveryPage(stamp, [A4], [stamp], id).length, 0)
})

test('taking it off the other pages finds every copy, and only the copies', () => {
  const sizes = [A4, LETTER, A4]
  const copies = copiesForEveryPage(stamp, sizes, [stamp], id)
  // A copy moved by hand on page 3 is still one of the copies (2026-10-22).
  const moved = { ...copies[1], x: copies[1].x + 50 }
  // Another picture in the same spot is not this one.
  const other = { ...copies[0], id: 'other', src: 'data:image/png;base64,BBB', everyPageOf: undefined }
  const ids = copiesOnOtherPages(stamp, sizes, [stamp, copies[0], moved, other])
  assert.deepEqual(ids.sort(), [copies[0].id, moved.id].sort())
  // Selected on another page, it is the original on page 1 that goes.
  assert.deepEqual(copiesOnOtherPages(copies[0], sizes, [stamp, ...copies]).sort(), [stamp.id, copies[1].id].sort())
})

// James, 2026-10-22: "applying signature to every page then moving the
// original one, it should still have the remove from all pages icon".
test('moving the original keeps it on every page, and Take off still finds the copies', () => {
  const sizes = [A4, A4, A4]
  const copies = copiesForEveryPage(stamp, sizes, [stamp], id)
  assert.ok(copies.every((c) => c.everyPageOf === stamp.id))
  const movedOriginal = { ...stamp, x: stamp.x + 120, y: stamp.y + 300 }
  const all = [movedOriginal, ...copies]
  // Nothing more to add, so the button offers to take them off…
  assert.equal(copiesForEveryPage(movedOriginal, sizes, all, id).length, 0)
  // …and taking them off finds both copies.
  assert.deepEqual(copiesOnOtherPages(movedOriginal, sizes, all).sort(), copies.map((c) => c.id).sort())
})

test('a page whose copy was deleted gets one again, and only that page', () => {
  const sizes = [A4, A4, A4]
  const copies = copiesForEveryPage(stamp, sizes, [stamp], id)
  const movedOriginal = { ...stamp, x: stamp.x + 80 }
  const again = copiesForEveryPage(movedOriginal, sizes, [movedOriginal, copies[0]], id)
  assert.deepEqual(again.map((c) => c.pageIndex), [2])
  assert.equal(again[0].everyPageOf, stamp.id)
})

test('copies made from a copy join the same set', () => {
  const sizes = [A4, A4, A4]
  const [c1] = copiesForEveryPage(stamp, sizes, [stamp], id)
  const fromCopy = copiesForEveryPage(c1, sizes, [c1], id)
  assert.ok(fromCopy.every((c) => c.everyPageOf === stamp.id))
})
