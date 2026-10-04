// Compare two PDFs — the pixel and text diffs.
//
//   npm run test:compare

import assert from 'node:assert/strict'
import test from 'node:test'
import { diffPixels, diffSequences, diffWords, joinWords, toHunks, tokenize } from '../src/lib/compare.ts'

const apply = (runs) => ({
  a: runs.filter((r) => r.kind !== 'insert').flatMap((r) => r.items),
  b: runs.filter((r) => r.kind !== 'delete').flatMap((r) => r.items),
})

test('identical sequences are one equal run', () => {
  assert.deepEqual(diffSequences([1, 2, 3], [1, 2, 3]), [{ kind: 'equal', items: [1, 2, 3] }])
  assert.deepEqual(diffSequences([], []), [])
})

test('the diff always rebuilds both sides, and is minimal on small cases', () => {
  const cases = [
    ['abcabba', 'cbabac'],
    ['the quick brown fox', 'the slow brown dog'],
    ['', 'abc'],
    ['abc', ''],
    ['xaxbxcx', 'abc'],
  ]
  for (const [x, y] of cases) {
    const a = [...x]
    const b = [...y]
    const runs = diffSequences(a, b)
    const back = apply(runs)
    assert.deepEqual(back.a, a, x)
    assert.deepEqual(back.b, b, y)
  }
  // Myers' classic example: 5 edits.
  const edits = diffSequences([...'abcabba'], [...'cbabac'])
    .filter((r) => r.kind !== 'equal')
    .reduce((n, r) => n + r.items.length, 0)
  assert.equal(edits, 5)
})

test('random sequences round-trip', () => {
  let seed = 7
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  for (let t = 0; t < 200; t++) {
    const a = Array.from({ length: Math.floor(rnd() * 40) }, () => 'abcd'[Math.floor(rnd() * 4)])
    const b = Array.from({ length: Math.floor(rnd() * 40) }, () => 'abcd'[Math.floor(rnd() * 4)])
    const back = apply(diffSequences(a, b, 1000))
    assert.deepEqual(back.a, a)
    assert.deepEqual(back.b, b)
  }
})

test('gives up (null) past the edit budget rather than burning memory', () => {
  const a = Array.from({ length: 300 }, (_, i) => `a${i}`)
  const b = Array.from({ length: 300 }, (_, i) => `b${i}`)
  assert.equal(diffSequences(a, b, 100), null)
})

test('word diff of two versions of a contract', () => {
  const a = tokenize(['The tenant shall pay rent of £900 monthly.', 'Notice period: one month.'])
  const b = tokenize(['The tenant shall pay rent of £950 monthly in advance.', 'Notice period: one month.'])
  const runs = diffWords(a, b)
  const del = runs.filter((r) => r.kind === 'delete').flatMap((r) => r.items.map((w) => w.text))
  const ins = runs.filter((r) => r.kind === 'insert').flatMap((r) => r.items.map((w) => w.text))
  assert.deepEqual(del, ['£900', 'monthly.'])
  assert.deepEqual(ins, ['£950', 'monthly', 'in', 'advance.'])
  const { hunks } = toHunks(runs, 3)
  assert.equal(hunks.length, 1)
  assert.equal(hunks[0].page, 0)
})

test('CJK text compares character by character and prints without spaces', () => {
  const a = tokenize(['日本語の文書を検索できます'])
  const b = tokenize(['日本語の書類を検索できます'])
  const runs = diffWords(a, b)
  assert.deepEqual(runs.filter((r) => r.kind === 'delete').flatMap((r) => r.items.map((w) => w.text)), ['文'])
  assert.deepEqual(runs.filter((r) => r.kind === 'insert').flatMap((r) => r.items.map((w) => w.text)), ['類'])
  assert.equal(joinWords(a), '日本語の文書を検索できます')
})

test('a hunk only adding text is labelled with the second document’s page', () => {
  const a = tokenize(['one two three', 'four five six'])
  const b = tokenize(['one two three', 'four five NEW six'])
  const { hunks } = toHunks(diffWords(a, b), 2)
  assert.equal(hunks.length, 1)
  assert.equal(hunks[0].pageIn, 'b')
  assert.equal(hunks[0].page, 1)
})

test('long unchanged stretches are skipped with a count', () => {
  const words = Array.from({ length: 100 }, (_, i) => `w${i}`)
  const a = tokenize([words.join(' ')])
  const b = tokenize([words.map((w, i) => (i === 50 ? 'CHANGED' : w)).join(' ')])
  const { hunks, skippedAfter } = toHunks(diffWords(a, b), 5)
  assert.equal(hunks.length, 1)
  assert.equal(hunks[0].skippedBefore, 45)
  assert.equal(skippedAfter, 44)
})

test('two documents far apart still diff via the chunked fallback', () => {
  const mk = (p) => Array.from({ length: 6000 }, (_, i) => `${p}${i % 997}`).join(' ')
  const a = tokenize([mk('x') + ' common tail words here'])
  const b = tokenize([mk('y') + ' common tail words here'])
  const runs = diffWords(a, b)
  assert.ok(runs, 'chunked fallback produced a diff')
  const back = apply(runs)
  assert.equal(back.a.length, a.length)
  assert.equal(back.b.length, b.length)
})

test('pixels: identical is zero, ink only in one side is red or green', () => {
  const white = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255])
  const inkFirst = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255])
  const out = new Uint8ClampedArray(8)
  assert.equal(diffPixels(white, white.slice(), out), 0)
  assert.equal(diffPixels(inkFirst, white, out), 1)
  assert.deepEqual([...out.slice(0, 3)], [220, 38, 38])
  assert.equal(diffPixels(white, inkFirst, out), 1)
  assert.deepEqual([...out.slice(0, 3)], [22, 163, 74])
  // Faint anti-aliasing noise is under the tolerance.
  const grey = new Uint8ClampedArray([230, 230, 230, 255, 255, 255, 255, 255])
  assert.equal(diffPixels(grey, white), 0)
})
