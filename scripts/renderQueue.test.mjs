// The page-rasterization gate — order, concurrency, and giving slots back.
//
//   npm run test:render-queue
//
// Runs under Node's type-stripping, so `renderQueue.ts` is imported directly.
// ⚠️ That is why that module imports NOTHING — same landmine as
// `hostedPath.test.mjs`: type-stripping cannot resolve React or the stores, and
// one import of theirs would take this red for a reason unrelated to ordering.
//
// What is being pinned, and why it matters. The viewer mounts a `PdfPage` for
// every page at once, and each used to ask pdf.js to rasterize it in the same
// tick. Measured on a 400-page document: the document reached the store in
// 0.09 s and page 1 did not appear until 7.68 s — at the same moment as page
// 400. These tests hold the two properties that fix it: only a few pages
// rasterize at a time, and the ones nearest the reader go first.
//
// Negative control (2026-08-31, run): raising CONCURRENCY to Infinity turns the
// concurrency tests red; picking waiters in insertion order instead of by
// distance turns the ordering ones red.

import {
  requestRenderSlot,
  setAnchorPage,
  __resetRenderQueue,
  __renderQueueState,
  RENDER_CONCURRENCY
} from '../src/lib/renderQueue.ts'

let pass = 0
let fail = 0
function eq(actual, expected, label) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a === b) {
    pass++
    console.log(`  ✓ ${label}`)
  } else {
    fail++
    console.log(`  ✗ ${label}\n      expected ${b}\n      got      ${a}`)
  }
}
// The queue resolves through promises, so a granted slot is only observable on
// a later microtask.
const settle = () => new Promise((r) => setTimeout(r, 0))

console.log('\nonly a few pages rasterize at once')
__resetRenderQueue()
{
  const slots = Array.from({ length: 20 }, (_, i) => requestRenderSlot(i))
  const granted = []
  slots.forEach((s, i) => void s.granted.then((go) => go && granted.push(i)))
  await settle()
  eq(granted.length, RENDER_CONCURRENCY, `exactly ${RENDER_CONCURRENCY} start`)
  eq(__renderQueueState().waiting, 20 - RENDER_CONCURRENCY, 'the rest wait their turn')
  eq(granted, [0, 1, 2].slice(0, RENDER_CONCURRENCY), 'and they are the first pages')
}

console.log('\na finished page hands its slot on')
__resetRenderQueue()
{
  const slots = Array.from({ length: 8 }, (_, i) => requestRenderSlot(i))
  const granted = []
  slots.forEach((s, i) => void s.granted.then((go) => go && granted.push(i)))
  await settle()
  slots[0].release()
  await settle()
  eq(granted.length, RENDER_CONCURRENCY + 1, 'one more page starts')
  eq(granted[granted.length - 1], RENDER_CONCURRENCY, 'the next one in order')
}

console.log('\nthe reader decides what is next, not the page number')
__resetRenderQueue()
{
  // Everything queued while the reader sits at page 0 …
  const slots = Array.from({ length: 30 }, (_, i) => requestRenderSlot(i))
  const granted = []
  slots.forEach((s, i) => void s.granted.then((go) => go && granted.push(i)))
  await settle()
  // … then they jump to page 20. The three already running are not disturbed,
  // but everything after them follows the reader.
  setAnchorPage(20)
  for (let i = 0; i < RENDER_CONCURRENCY; i++) slots[i].release()
  await settle()
  eq(
    granted.slice(RENDER_CONCURRENCY),
    [20, 21, 19],
    'page 20 first, then outwards — NOT page 3'
  )
}

console.log('\nleaving the queue')
__resetRenderQueue()
{
  const a = requestRenderSlot(0)
  const b = requestRenderSlot(1)
  const c = requestRenderSlot(2)
  const late = requestRenderSlot(50)
  let lateWent = null
  void late.granted.then((go) => {
    lateWent = go
  })
  await settle()
  eq(__renderQueueState().waiting, 1, 'page 50 is queued behind the three')
  late.release()
  await settle()
  eq(lateWent, false, 'a page that unmounts is told NOT to draw')
  eq(__renderQueueState().waiting, 0, 'and is gone from the queue')

  // ⚠️ The leak that would stop a document rendering halfway down: PdfPage
  // releases from a `finally` AND from the effect cleanup, so double release
  // is the normal case and must not free a slot twice.
  a.release()
  a.release()
  b.release()
  c.release()
  await settle()
  eq(__renderQueueState().running, 0, 'releasing twice does not free a slot twice')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
