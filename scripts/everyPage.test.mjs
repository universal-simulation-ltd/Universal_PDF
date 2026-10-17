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

import { copiesForEveryPage, placeOnPage } from '../src/lib/everyPage.ts'

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
