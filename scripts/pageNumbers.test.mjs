// Page numbers at the foot of every page.
//
//   npm run test:page-numbers
//
// Runs under Node's type-stripping; `pageNumbers.ts` imports only types.
//
// What is pinned (James, 2026-10-18: "page numbers"): one number per page,
// PAGE_NUMBER_MARGIN from the foot and from the side it is set to, centred on
// the page when centred, in the wording chosen; and the numbers put right when
// pages move — but never a number somebody retyped by hand. The browser half
// (the dialog, the canvas, the export, Remove) is e2e/page-numbers.e2e.mjs.

import assert from 'node:assert/strict'
import test from 'node:test'

import { PAGE_NUMBER_MARGIN, PAGE_NUMBER_SIZE, buildPageNumbers, pageNumberFixes, pageNumberText } from '../src/lib/pageNumbers.ts'

const A4 = { w: 595, h: 842 }
const LETTER = { w: 612, h: 792 }
const LH = 1.25
// 6pt a character: easy arithmetic.
const measure = (a) => a.text.length * 6
let n = 0
const id = () => `pn-${++n}`

test('the wording', () => {
  assert.equal(pageNumberText('{n}', 3, 9), '3')
  assert.equal(pageNumberText('Page {n} of {total}', 3, 9), 'Page 3 of 9')
  assert.equal(pageNumberText('Sayfa {n} / {total}', 10, 12), 'Sayfa 10 / 12')
})

test('a number on every page, at the foot', () => {
  const marks = buildPageNumbers([A4, LETTER, A4], '{n}', 'centre', measure, id, LH)
  assert.deepEqual(marks.map((m) => [m.pageIndex, m.text]), [[0, '1'], [1, '2'], [2, '3']])
  // The bottom of the line box is the margin above the foot of ITS page.
  assert.equal(marks[1].y + PAGE_NUMBER_SIZE * LH, LETTER.h - PAGE_NUMBER_MARGIN)
  assert.equal(marks[0].y + PAGE_NUMBER_SIZE * LH, A4.h - PAGE_NUMBER_MARGIN)
})

test('left, centre and right', () => {
  const [l] = buildPageNumbers([A4], 'Page {n} of {total}', 'left', measure, id, LH)
  const [c] = buildPageNumbers([A4], 'Page {n} of {total}', 'centre', measure, id, LH)
  const [r] = buildPageNumbers([A4], 'Page {n} of {total}', 'right', measure, id, LH)
  const w = 'Page 1 of 1'.length * 6
  assert.equal(l.x, PAGE_NUMBER_MARGIN)
  assert.equal(c.x + w / 2, A4.w / 2)
  assert.equal(r.x + w, A4.w - PAGE_NUMBER_MARGIN)
})

test('put right when the pages change, staying centred', () => {
  const marks = buildPageNumbers([A4, A4], 'Page {n} of {total}', 'centre', measure, id, LH)
  // Page 2 moved to the front, and eight pages merged in: ten in all.
  const moved = [{ ...marks[1], pageIndex: 0 }, { ...marks[0], pageIndex: 1 }]
  const fixes = pageNumberFixes(moved, 10, measure)
  const byId = Object.fromEntries(fixes.map((f) => [f.id, f.patch]))
  assert.equal(byId[marks[1].id].text, 'Page 1 of 10')
  assert.equal(byId[marks[0].id].text, 'Page 2 of 10')
  // "Page 1 of 10" is a character wider than "Page 1 of 2", and still centred.
  assert.equal(byId[marks[1].id].x + 'Page 1 of 10'.length * 3, A4.w / 2)
})

test('nothing to fix when they are right', () => {
  const marks = buildPageNumbers([A4, A4, A4], '{n}', 'right', measure, id, LH)
  assert.deepEqual(pageNumberFixes(marks, 3, measure), [])
})

test('a number retyped by hand is left alone', () => {
  const [m] = buildPageNumbers([A4, A4], 'Page {n} of {total}', 'centre', measure, id, LH)
  const retyped = { ...m, text: 'Cover' }
  assert.deepEqual(pageNumberFixes([retyped], 5, measure), [])
})

test('ordinary text marks are never touched', () => {
  const plain = { id: 't', type: 'text', pageIndex: 0, x: 10, y: 10, text: '7', color: '#000', fontSize: 10 }
  assert.deepEqual(pageNumberFixes([plain], 3, measure), [])
})
