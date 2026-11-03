// Page ranges for Print and Advanced export — "1-3, 5, 8-".
//
//   npm run test:page-range

import { parsePageRange, pagesFor, isWholeDocument } from '../src/lib/pageRange.ts'

let fail = 0
const eq = (actual, expected, label) => {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) console.log(`  ok   ${label}  -> ${a}`)
  else {
    fail++
    console.log(`  FAIL ${label}  -> ${a}, expected ${e}`)
  }
}

eq(parsePageRange('1-3, 5', 10), [0, 1, 2, 4], 'a range and a page')
eq(parsePageRange('8-', 10), [7, 8, 9], 'open end runs to the last page')
eq(parsePageRange('-2', 10), [0, 1], 'open start runs from page 1')
eq(parsePageRange('3–1', 10), [2, 1, 0], 'en dash, and backwards prints backwards')
eq(parsePageRange('2 4;6', 10), [1, 3, 5], 'spaces and semicolons separate too')
eq(parsePageRange('1-3, 2', 10), [0, 1, 2], 'a page named twice prints once')
eq(parsePageRange('11', 10), null, 'past the last page is an error, not a quiet skip')
eq(parsePageRange('0', 10), null, 'there is no page 0')
eq(parsePageRange('2-x', 10), null, 'junk is an error')
eq(parsePageRange('-', 10), null, 'a bare dash names nothing')
eq(parsePageRange('  ', 10), null, 'empty names nothing')
eq(pagesFor({ kind: 'all' }, 3, 1), [0, 1, 2], 'All')
eq(pagesFor({ kind: 'current' }, 3, 1), [1], 'This page')
eq(pagesFor({ kind: 'current' }, 3, 9), [2], 'This page, clamped')
eq(isWholeDocument([0, 1, 2], 3), true, 'every page in order is the whole file')
eq(isWholeDocument([0, 2, 1], 3), false, 'reordered is not')

if (fail) {
  console.log(`\n${fail} failed`)
  process.exit(1)
}
console.log('\nall passed')
