// A signature's details placed under it as separate lines.
//
//   npm run test:sig-lines
//
// Runs under Node's type-stripping; `sigLines.ts` imports nothing.
//
// What is pinned (James, 2026-10-22: "automatically place it underneath the
// signature once the signature location is picked. Allow the user to click and
// drag them individually still"): each line starts under the signature, left
// edges lined up, one under the other in reading order, the name largest; and
// a block that would run off the foot of the page moves up to fit.

import assert from 'node:assert/strict'
import test from 'node:test'

import { stackUnder } from '../src/lib/sigLines.ts'

const sig = { x: 100, y: 200, width: 160, height: 50 }
const lines = [
  { text: 'James Markey', scale: 1 },
  { text: 'Director', scale: 0.7 },
  { text: 'Signed on 22 Oct 2026', scale: 0.8 },
]

test('each line under the signature, left edges lined up, in order', () => {
  const out = stackUnder(sig, lines, 842)
  assert.equal(out.sigY, 200)
  assert.deepEqual(out.lines.map((l) => l.text), lines.map((l) => l.text))
  assert.ok(out.lines.every((l) => l.x === sig.x))
  assert.ok(out.lines[0].y >= sig.y + sig.height, 'first line below the ink')
  for (let i = 1; i < out.lines.length; i++) {
    assert.ok(out.lines[i].y >= out.lines[i - 1].y + out.lines[i - 1].fontSize, `line ${i} below line ${i - 1}`)
  }
})

test('the name is the largest line', () => {
  const [name, detail, date] = stackUnder(sig, lines, 842).lines
  assert.ok(name.fontSize > date.fontSize && date.fontSize > detail.fontSize)
})

test('near the foot of the page, the whole block moves up to fit', () => {
  const low = { ...sig, y: 800 }
  const out = stackUnder(low, lines, 842)
  const last = out.lines[out.lines.length - 1]
  assert.ok(last.y + last.fontSize * 1.3 <= 842 + 0.001, JSON.stringify(out))
  assert.ok(out.sigY < 800)
  assert.ok(out.lines[0].y >= out.sigY + sig.height, 'still under the ink')
})

test('never pushed above the top of the page', () => {
  const tall = { ...sig, y: 5, height: 60 }
  const out = stackUnder(tall, Array.from({ length: 80 }, (_, i) => ({ text: `line ${i}`, scale: 1 })), 300)
  assert.equal(out.sigY, 0)
})

test('no lines, nothing moves', () => {
  assert.deepEqual(stackUnder(sig, [], 842), { sigY: 200, lines: [] })
})
