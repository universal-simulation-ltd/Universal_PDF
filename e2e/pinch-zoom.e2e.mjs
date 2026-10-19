// Pinch-to-zoom — browser-level regression check.
//
//   ./scripts/preview.sh   # in one terminal (Universal PDF is :5174)
//   npm run test:pinch     # in another
//
// A pinch has exactly one job: change the scale. It went wrong in three ways
// at once, and each one is asserted here.
//
//   • It followed the midpoint of the two fingers, so the fingers drifting a
//     few pixels — which they always do — panned the document while it was
//     scaling. Two motions fighting over the same pixels is what "jaggered"
//     means. A pinch now scales about the point it started on and nothing else
//     moves, however far the midpoint wanders.
//   • It committed a new zoom on every touchmove, which re-rasterized every
//     page through pdf.js sixty times a second. The gesture is now a CSS
//     transform — no re-render at all until the fingers lift.
//   • The scroll correction landed a frame before the pages had resized, so
//     it was clamped against the old, smaller extent and the document jumped
//     when the zoom committed. The zoom now re-anchors on the page itself
//     once the layout is in, which is exact.
//
// Touches are dispatched over CDP: Playwright's touchscreen API only taps,
// and a pinch needs two points moved together.

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { keepAppModuleUrls } from './app-modules.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174/'

// Sibling repos that carry a Playwright install, newest-known first. See
// office-import.e2e.mjs for why this launches a browser rather than trusting
// the first candidate that imports.
const PLAYWRIGHT_CANDIDATES = [
  '../../Universal_Beam/node_modules/playwright/index.js',
  '../../Universal_Exports/node_modules/playwright/index.js',
  '../../Universal_Video/node_modules/playwright/index.js',
  '../../../UNI_SIM_Assess/Ergo_Assess/frontend/node_modules/playwright/index.js',
  '../node_modules/playwright/index.js'
]

async function loadPlaywright() {
  const problems = []
  for (const rel of PLAYWRIGHT_CANDIDATES) {
    let mod
    try {
      mod = (await import(pathToFileURL(join(HERE, rel)).href)).default
    } catch {
      continue // not installed here
    }
    try {
      const probe = await mod.chromium.launch()
      await probe.close()
      return mod
    } catch (err) {
      problems.push(`  ${rel}\n    ${String(err).split('\n')[0]}`)
    }
  }
  console.error(
    'No usable Playwright found. Candidates that imported but could not launch:\n' +
      (problems.join('\n') || '  (none imported at all)') +
      '\n\nInstall it in a sibling Universal app (e.g. Universal_Beam), or run:\n' +
      '  npm i -D playwright && npx playwright install chromium'
  )
  process.exit(2)
}

const failures = []
function check(label, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${label}`)
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
    failures.push(label)
  }
}

// A tall, wordy PDF so there is something to scroll and something to anchor on.
async function testPdf() {
  const { PDFDocument, StandardFonts } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let p = 0; p < 3; p++) {
    const page = doc.addPage([595, 842])
    page.drawText(`Pinch test — page ${p + 1}`, { x: 60, y: 780, size: 24, font })
    for (let l = 0; l < 26; l++) {
      page.drawText(`Line ${l} of body text on page ${p + 1}`, { x: 60, y: 720 - l * 24, size: 12, font })
    }
  }
  return Buffer.from(await doc.save())
}

// 595 pt wide at 96/72 css px per pt is what the viewer calls 100%.
const HUNDRED_PERCENT_WIDTH = (595 * 96) / 72
// A phone-shaped window, so a zoomed page is wider than the viewport.
// ⚠️ `screen` matters as well as `viewport`: the render budget reads it (with
// maxTouchPoints) to decide whether this is a handheld, and a handheld gets the
// smaller canvas budget — which is what sets the zoom ceiling asserted below.
const PHONE = {
  hasTouch: true,
  viewport: { width: 420, height: 780 },
  screen: { width: 420, height: 780 },
  deviceScaleFactor: 2
}

// Every canvas the document is holding right now, in backing-store pixels
// (×4 for bytes). The pages' bitmaps and the Konva annotation stages both
// count; Konva's hit canvas is offscreen and is not in this total.
const canvasPixels = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('canvas')].reduce((n, c) => n + c.width * c.height, 0)
  )

// The handheld budget from lib/renderBudget — 64 M pixels, halved on a device
// that admits to under 4 GB of RAM.
const HANDHELD_BUDGET_PIXELS = 64_000_000

const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const pdf = await testPdf()

// ⚠️ Pinned to pages one under another unless a case asks for the row. A
// phone-width window starts with the pages in a row (2026-10-12), and the
// checks below were written for the column: the anchor holding up and down,
// the sideways re-centre. The row's own case is at the end of the pinches.
async function openViewer(options, scroll = 'vertical') {
  const context = await browser.newContext(options)
  await context.addInitScript((v) => {
    try { localStorage.setItem('unisim:default-view:pdf:page-scroll', v) } catch { /* no storage */ }
  }, scroll)
  const page = await context.newPage()
  page.on('pageerror', (e) => failures.push('page error: ' + e.message))
  try {
    await page.goto(BASE, { waitUntil: 'load' })
  } catch {
    console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
    await browser.close()
    process.exit(2)
  }
  await page.setInputFiles('input[type=file]', { name: 'pinch.pdf', mimeType: 'application/pdf', buffer: pdf })
  await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
  await page.waitForTimeout(1200)
  const cdp = await context.newCDPSession(page)
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points })
  return { context, page, touch }
}

// Everything the assertions need, read off the first page and its scroller.
const readState = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-page-index="0"]')
    const rect = el.getBoundingClientRect()
    const scroller = document.querySelector('.overflow-auto')
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      cssWidth: parseFloat(el.querySelector('canvas').style.width),
      transform: scroller.firstElementChild.style.transform,
      scrollLeft: scroller.scrollLeft,
      scrollWidth: scroller.scrollWidth,
      clientWidth: scroller.clientWidth,
      renders: window.__pageRenders ?? 0
    }
  })

// Count the moments the first page takes a new size — one per committed zoom.
const countRenders = (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector('[data-page-index="0"] canvas')
    let last = canvas.style.width
    window.__pageRenders = 0
    new MutationObserver(() => {
      if (canvas.style.width === last) return
      last = canvas.style.width
      window.__pageRenders++
    }).observe(canvas, { attributes: true, attributeFilter: ['style'] })
  })

// Drive a pinch from `spread` px between the fingers to `endSpread`, dragging
// the midpoint by (driftX, driftY) along the way — the drift is the point.
async function pinch(touch, { x, y, spread, endSpread, driftX = 0, driftY = 0, steps = 20 }) {
  await touch('touchStart', [
    { x: x - spread / 2, y, id: 1 },
    { x: x + spread / 2, y, id: 2 }
  ])
  for (let i = 1; i <= steps; i++) {
    const f = i / steps
    const half = (spread + (endSpread - spread) * f) / 2
    const mx = x + driftX * f
    const my = y + driftY * f
    await touch('touchMove', [
      { x: mx - half, y: my, id: 1 },
      { x: mx + half, y: my, id: 2 }
    ])
  }
}

// A pure scale about (x, y) puts a point at `from` here, whatever the fingers
// did with the midpoint in between.
const anchoredTo = (from, at, ratio) => at + (from - at) * ratio

console.log('\npinch out, with the midpoint drifting 70 px right and 50 px down')
{
  const { context, page, touch } = await openViewer(PHONE)
  await countRenders(page)
  const before = await readState(page)
  const x = 210
  const y = 400
  await pinch(touch, { x, y, spread: 100, endSpread: 220, driftX: 70, driftY: 50 })
  const during = await readState(page)
  await touch('touchEnd', [])
  await page.waitForTimeout(2000)
  const after = await readState(page)

  const ratio = during.width / before.width
  check('the document scales with the fingers', Math.abs(ratio - 2.2) < 0.05, `${ratio.toFixed(3)}x for a 2.2x spread`)
  check('no page re-renders while the fingers are down', during.renders === 0, `${during.renders} re-renders`)
  check(
    'the drifting midpoint does not pan the document',
    Math.abs(during.left - anchoredTo(before.left, x, ratio)) < 2 &&
      Math.abs(during.top - anchoredTo(before.top, y, ratio)) < 2,
    `page at (${during.left.toFixed(1)}, ${during.top.toFixed(1)}), an anchored scale puts it at ` +
      `(${anchoredTo(before.left, x, ratio).toFixed(1)}, ${anchoredTo(before.top, y, ratio).toFixed(1)})`
  )
  check(
    'the zoom lands where the pinch left it',
    Math.abs(after.left - during.left) < 3 && Math.abs(after.top - during.top) < 3,
    `moved (${(after.left - during.left).toFixed(1)}, ${(after.top - during.top).toFixed(1)}) px on commit`
  )
  check('the pages re-render once, at the end', after.renders === 1, `${after.renders} re-renders`)
  check('the gesture leaves no transform behind', after.transform === '', `transform="${after.transform}"`)
  // Flex centring used to push half of an over-wide page outside the
  // scrollable area, where no amount of scrolling reached it — and a zoom
  // anchored there landed short because the scroll it asked for was clamped.
  const leftEdge = await page.evaluate(() => {
    const scroller = document.querySelector('.overflow-auto')
    scroller.scrollLeft = 0
    return document.querySelector('[data-page-index="0"]').getBoundingClientRect().left
  })
  check('scrolled fully left, the left edge of a zoomed page is on screen', leftEdge >= -1,
    `page starts ${leftEdge.toFixed(1)}px from the left of the window`)
  await context.close()
}

console.log('\npinch in, from zoomed, with the midpoint drifting the other way')
{
  const { context, page, touch } = await openViewer(PHONE)
  await pinch(touch, { x: 210, y: 400, spread: 80, endSpread: 200, steps: 12 })
  await touch('touchEnd', [])
  await page.waitForTimeout(1500)

  const before = await readState(page)
  const x = 200
  const y = 300
  await pinch(touch, { x, y, spread: 240, endSpread: 100, driftX: -60, driftY: 40 })
  const during = await readState(page)
  await touch('touchEnd', [])
  await page.waitForTimeout(2000)
  const after = await readState(page)

  const ratio = during.width / before.width
  check('the document shrinks with the fingers', Math.abs(ratio - 100 / 240) < 0.03, `${ratio.toFixed(3)}x`)
  // Sideways this pinch shrinks the page back to narrower than the window, so
  // it runs out of scroll and re-centres — there is no scroll position that
  // holds the anchor, and the gesture gives that up a pixel at a time rather
  // than in a jump at the end (the next check pins the "no jump" half down).
  // Vertically there is plenty of document either side, so the anchor holds.
  check(
    'the drifting midpoint does not pan the document',
    Math.abs(during.top - anchoredTo(before.top, y, ratio)) < 2,
    `page top at ${during.top.toFixed(1)}, an anchored scale puts it at ${anchoredTo(before.top, y, ratio).toFixed(1)}`
  )
  check(
    'the zoom lands where the pinch left it',
    Math.abs(after.left - during.left) < 3 && Math.abs(after.top - during.top) < 3,
    `moved (${(after.left - during.left).toFixed(1)}, ${(after.top - during.top).toFixed(1)}) px on commit`
  )
  await context.close()
}

console.log('\npages in a row: pinched smaller than the window, the row lands where the gesture left it')
{
  // A phone opens in a row now (2026-10-12). Across the row there is only one
  // page's height of document, so a pinch that shrinks the page below the
  // window's height ends with the row centred by its auto margins — and the
  // gesture has to arrive there, not jump there on release (it jumped 59px).
  const { context, page, touch } = await openViewer(PHONE, 'horizontal')
  await pinch(touch, { x: 210, y: 400, spread: 80, endSpread: 200, steps: 12 })
  await touch('touchEnd', [])
  await page.waitForTimeout(1500)
  await pinch(touch, { x: 200, y: 300, spread: 240, endSpread: 100, driftX: -60, driftY: 40 })
  const during = await readState(page)
  await touch('touchEnd', [])
  await page.waitForTimeout(2000)
  const after = await readState(page)
  check('in a row, the page shrinks with the fingers', during.width < after.width + 3 && during.transform !== '',
    `${during.width.toFixed(1)}px wide during, transform "${during.transform}"`)
  check('in a row, the zoom lands where the pinch left it',
    Math.abs(after.left - during.left) < 3 && Math.abs(after.top - during.top) < 3,
    `moved (${(after.left - during.left).toFixed(1)}, ${(after.top - during.top).toFixed(1)}) px on commit`)
  await context.close()
}

console.log('\npages in a row, at either end: the page lands where the pinch left it, not to one side')
{
  // James, 2026-10-19, on his iPhone: "When zooming in and out the page jumps
  // to the right for some reason." Page 1 can never sit right of the middle of
  // the window and the last page never left of it — the row's end padding and
  // the end of the scroll range see to that — so a pinch about a point that
  // asked for either was held there by the gesture and then jumped on release
  // as the commit scrolled as far as it could: right on the last page (21px
  // and 89px for the two pinches below), left on page 1 (105px). The gesture
  // now eases the page into where the commit can put it, so release is still.
  const IPHONE = {
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    deviceScaleFactor: 3
  }
  const readPage = (page, i) =>
    page.evaluate((i) => {
      const r = document.querySelector(`[data-page-index="${i}"]`).getBoundingClientRect()
      return { left: r.left, top: r.top, width: r.width }
    }, i)
  // One pinch about (x, 380) and its release: the anchored page's position
  // with the fingers still down, and once the zoom has committed.
  async function pinchAndRelease(page, touch, i, x, spread, endSpread) {
    await pinch(touch, { x, y: 380, spread, endSpread, steps: 15 })
    const during = await readPage(page, i)
    await touch('touchEnd', [])
    await page.waitForTimeout(1500)
    const after = await readPage(page, i)
    return { during, after }
  }
  const landed = ({ during, after }) =>
    `moved (${(after.left - during.left).toFixed(1)}, ${(after.top - during.top).toFixed(1)}) px on release`
  const still = ({ during, after }) =>
    Math.abs(after.left - during.left) < 3 && Math.abs(after.top - during.top) < 3

  const { context, page, touch } = await openViewer(IPHONE, 'horizontal')
  const last = await page.evaluate(() => document.querySelectorAll('[data-page-index]').length - 1)
  await page.evaluate((i) => document.querySelector(`[data-page-index="${i}"]`).scrollIntoView({ inline: 'center' }), last)
  await page.waitForTimeout(800)
  const shrunk = await pinchAndRelease(page, touch, last, 140, 200, 110)
  check('the last page, pinched smaller left of centre, does not jump right', still(shrunk), landed(shrunk))
  const grown = await pinchAndRelease(page, touch, last, 300, 60, 140)
  check('the last page, pinched bigger near its right edge, does not jump right', still(grown), landed(grown))
  // Something the clamp must NOT do: a pinch in the middle of the row still
  // holds the point under the fingers exactly.
  await page.evaluate(() => document.querySelector('[data-page-index="1"]').scrollIntoView({ inline: 'center' }))
  await page.waitForTimeout(800)
  const before = await readPage(page, 1)
  const middle = await pinchAndRelease(page, touch, 1, 150, 100, 180)
  const ratio = middle.during.width / before.width
  check('a page mid-row still scales about the fingers', Math.abs(middle.during.left - anchoredTo(before.left, 150, ratio)) < 2,
    `page at ${middle.during.left.toFixed(1)}, an anchored scale puts it at ${anchoredTo(before.left, 150, ratio).toFixed(1)}`)
  check('…and lands there', still(middle), landed(middle))
  await page.evaluate(() => { document.querySelector('.overflow-auto').scrollLeft = 0 })
  await page.waitForTimeout(800)
  const first = await pinchAndRelease(page, touch, 0, 250, 200, 110)
  check('page 1, pinched smaller right of centre, does not jump left', still(first), landed(first))
  await context.close()
}

console.log('\nthe phone screens, Mark up: nothing moves under the fingers, from the first finger to release')
{
  // James, 2026-10-19, an iPhone recording of Mark up: "see how it jumps on
  // zoom". Two jumps, both measured here on the phone screens (`?app`) at an
  // iPhone 15 Pro's 393x852:
  //
  //   • ON RELEASE, every page slid 180px sideways. The row is padded by half
  //     the window less half of page 1 (`--doc-display-width`), and a zoom
  //     dropped that variable and set it again from a promise — so the zoom
  //     put the fingers' point back against a row padded by half the window,
  //     then the variable landed and the padding shrank by 180px.
  //   • AS THE PINCH BEGAN, the pages slid up 34px: the first finger landed on
  //     a highlight, which selected it, the Mark up sheet grew to show its ink
  //     and width, and the document above the sheet got shorter.
  //
  // What is asserted is the document point under the fingers' midpoint, as a
  // fraction of the page, before, during and after.
  const IPHONE = {
    hasTouch: true,
    isMobile: true,
    viewport: { width: 393, height: 852 },
    screen: { width: 393, height: 852 },
    deviceScaleFactor: 3
  }
  const context = await browser.newContext(IPHONE)
  await keepAppModuleUrls(context)
  const page = await context.newPage()
  page.on('pageerror', (e) => failures.push('page error: ' + e.message))
  await page.goto(`${BASE}?app`, { waitUntil: 'load' })
  await page.getByText('Try with example PDF').click()
  await page.waitForSelector('[data-page-index="0"] canvas', { timeout: 30000 })
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'Mark up' }).click()
  await page.waitForTimeout(1000)
  const cdp = await context.newCDPSession(page)
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points })
  const store = (src) =>
    page.evaluate(async (src) => {
      const m = await (globalThis.__appImport ?? ((p) => import(p)))('/src/stores/annotationStore.ts')
      // eslint-disable-next-line no-new-func
      return new Function('s', src)(m.useAnnotationStore.getState())
    }, src)
  const box = (i) =>
    page.evaluate((i) => {
      const r = document.querySelector(`[data-page-index="${i}"]`).getBoundingClientRect()
      return { left: r.left, top: r.top, width: r.width, height: r.height, viewH: document.querySelector('.overflow-auto').clientHeight }
    }, i)
  // Where (x, y) on screen is on the page, in page pixels at that box's size.
  const offBy = (a, b, x, y) =>
    Math.hypot(((x - a.left) / a.width - (x - b.left) / b.width) * b.width, ((y - a.top) / a.height - (y - b.top) / b.height) * b.height)
  // A real pinch: one finger, then the other a beat later, spread, lift one, lift both.
  async function realPinch(x, y, spread, endSpread) {
    await touch('touchStart', [{ x: x - spread / 2, y, id: 1 }])
    await page.waitForTimeout(50)
    const pressed = await box(0)
    await touch('touchStart', [{ x: x - spread / 2, y, id: 1 }, { x: x + spread / 2, y, id: 2 }])
    for (let i = 1; i <= 16; i++) {
      const half = (spread + ((endSpread - spread) * i) / 16) / 2
      await touch('touchMove', [{ x: x - half, y, id: 1 }, { x: x + half, y, id: 2 }])
    }
    await page.waitForTimeout(100)
    const during = await box(0)
    await touch('touchEnd', [{ x: x + endSpread / 2, y, id: 2 }])
    await touch('touchEnd', [])
    await page.waitForTimeout(1500)
    const after = await box(0)
    return { pressed, during, after }
  }

  // A highlight across page 1, then nothing in hand, as in the recording.
  await page.getByRole('button', { name: 'Highlight', exact: true }).click()
  let p1 = await box(0)
  const lineY = p1.top + p1.height * 0.5
  await touch('touchStart', [{ x: p1.left + p1.width * 0.2, y: lineY, id: 1 }])
  for (let i = 1; i <= 10; i++) await touch('touchMove', [{ x: p1.left + p1.width * (0.2 + 0.06 * i), y: lineY, id: 1 }])
  await touch('touchEnd', [])
  await page.waitForTimeout(500)
  await store("s.setTool('select'); s.setSelected(null)")
  await page.waitForTimeout(600)

  // Pinch out about a point right of the middle of page 1, the first finger
  // on the highlight.
  const before = await box(0)
  const y = before.top + before.height * 0.5
  const x = 230
  const { pressed, during, after } = await realPinch(x, y, 60, 130)
  check('the first finger on a mark does not move the pages', offBy(before, pressed, x, y) < 2 && pressed.viewH === before.viewH,
    `page moved ${offBy(before, pressed, x, y).toFixed(1)}px, document ${before.viewH}px tall then ${pressed.viewH}px`)
  check('the point under the fingers stays under them while they pinch', offBy(before, during, x, y) < 3,
    `${offBy(before, during, x, y).toFixed(1)}px off`)
  check('…and when they lift (it slid 180px sideways)', offBy(during, after, x, y) < 3,
    `${offBy(during, after, x, y).toFixed(1)}px on release, page left ${during.left.toFixed(1)} -> ${after.left.toFixed(1)}`)
  check('the zoom took', after.width > before.width * 2, `${(after.width / before.width).toFixed(2)}x`)
  check('the pinch leaves the mark under the first finger unselected', (await store('return s.selectedIds.length')) === 0)
  check('…and nothing in hand', (await store('return s.tool')) === 'select')

  // Back out again, about a point left of the middle, on a bare bit of page.
  const zoomed = await box(0)
  const back = await realPinch(150, 300, 160, 80)
  check('pinching back in: still on release', offBy(back.during, back.after, 150, 300) < 3,
    `${offBy(back.during, back.after, 150, 300).toFixed(1)}px on release`)
  check('…and it did shrink', back.after.width < zoomed.width * 0.7, `${(back.after.width / zoomed.width).toFixed(2)}x`)

  // A tap on the mark still selects it (the sheet's hold only lasts the press).
  p1 = await box(0)
  await touch('touchStart', [{ x: p1.left + p1.width * 0.5, y: p1.top + p1.height * 0.5, id: 1 }])
  await touch('touchEnd', [])
  await page.waitForTimeout(500)
  check('a tap on the highlight still selects it', (await store('return s.selectedIds.length')) === 1)
  check('…and the sheet shows its width', (await page.getByText('Width', { exact: true }).count()) > 0)
  await context.close()
}

console.log('\nthe limits, and cleaning up after itself')
{
  const { context, page, touch } = await openViewer(PHONE)

  // Too small to change the layout box at all: the transform still has to go.
  await touch('touchStart', [{ x: 170, y: 400, id: 1 }, { x: 250, y: 400, id: 2 }])
  await touch('touchMove', [{ x: 169.8, y: 400, id: 1 }, { x: 250.2, y: 400, id: 2 }])
  await touch('touchEnd', [])
  await page.waitForTimeout(800)
  const hair = await readState(page)
  check('a hair-width pinch cleans up its transform', hair.transform === '', `transform="${hair.transform}"`)

  // The ceiling is not the constant 400% it used to be. Every page of the
  // document is rasterized at once, so what the zoom is really bounded by is
  // how much canvas the device can hold — `maxZoomForDocument` works that out
  // per document (see lib/renderBudget), and pinching past it stops there.
  //
  // The bug this replaced (2026-08-26): three A4 pages pinched to 400% on a
  // phone came to ~1.9 GB of backing store, the web view was killed for it, and
  // the document reloaded itself from scratch mid-gesture.
  for (let i = 0; i < 3; i++) {
    await pinch(touch, { x: 210, y: 400, spread: 44, endSpread: 300, steps: 10 })
    await touch('touchEnd', [])
    await page.waitForTimeout(1200)
  }
  const ceiling = await readState(page)
  const ceilingZoom = ceiling.cssWidth / HUNDRED_PERCENT_WIDTH
  const held = await canvasPixels(page)
  check('pinching past the ceiling stops short of the 400% hard cap', ceilingZoom < 4,
    `${Math.round(ceilingZoom * 100)}%`)
  check('the ceiling still leaves a useful amount of zoom', ceilingZoom > 1.5,
    `${Math.round(ceilingZoom * 100)}%`)
  check('the canvas held at the ceiling stays inside the budget', held < HANDHELD_BUDGET_PIXELS,
    `${(held / 1e6).toFixed(1)} M pixels (~${Math.round((held * 4) / 1e6)} MB)`)
  check('no transform survives the clamped pinch', ceiling.transform === '', `transform="${ceiling.transform}"`)

  // Once more from the ceiling: a clamped pinch must not creep past it.
  await pinch(touch, { x: 210, y: 400, spread: 44, endSpread: 300, steps: 10 })
  await touch('touchEnd', [])
  await page.waitForTimeout(1200)
  const stillCeiling = await readState(page)
  check('the ceiling holds on a repeat pinch', Math.abs(stillCeiling.cssWidth - ceiling.cssWidth) < 1,
    `${Math.round((stillCeiling.cssWidth / HUNDRED_PERCENT_WIDTH) * 100)}%`)

  for (let i = 0; i < 4; i++) {
    await pinch(touch, { x: 210, y: 400, spread: 380, endSpread: 40, steps: 10 })
    await touch('touchEnd', [])
    await page.waitForTimeout(1000)
  }
  const floor = await readState(page)
  check('pinching past the floor stops at 25%', Math.abs(floor.cssWidth / HUNDRED_PERCENT_WIDTH - 0.25) < 0.01,
    `${Math.round((floor.cssWidth / HUNDRED_PERCENT_WIDTH) * 100)}%`)
  check('the page still renders after all that', floor.width > 0 && floor.transform === '')
  await context.close()
}

console.log('\na third finger joining and leaving mid-pinch')
{
  const { context, page, touch } = await openViewer(PHONE)
  await touch('touchStart', [{ x: 160, y: 400, id: 1 }, { x: 260, y: 400, id: 2 }])
  await touch('touchMove', [{ x: 130, y: 400, id: 1 }, { x: 290, y: 400, id: 2 }])
  const two = await readState(page)
  // A third finger lands, then finger 1 lifts: the pair is now 2 and 3, whose
  // spread is nothing like the pair the gesture started from.
  await touch('touchStart', [{ x: 130, y: 400, id: 1 }, { x: 290, y: 400, id: 2 }, { x: 300, y: 460, id: 3 }])
  await touch('touchEnd', [{ x: 290, y: 400, id: 2 }, { x: 300, y: 460, id: 3 }])
  await touch('touchMove', [{ x: 290, y: 400, id: 2 }, { x: 302, y: 462, id: 3 }])
  const rebased = await readState(page)
  check('losing a finger does not jump the zoom', Math.abs(rebased.width / two.width - 1) < 0.05,
    `${(rebased.width / two.width).toFixed(3)}x across the hand-over`)
  await touch('touchEnd', [])
  await page.waitForTimeout(1500)
  const after = await readState(page)
  check('the hand-over still commits and cleans up', after.transform === '' && Math.abs(after.width - rebased.width) < 3,
    `page ${after.width.toFixed(1)}px vs ${rebased.width.toFixed(1)}px, transform="${after.transform}"`)
  await context.close()
}

console.log('\nctrl+wheel, the desktop zoom on the same machinery')
{
  const { context, page } = await openViewer({ viewport: { width: 1200, height: 900 } })
  const before = await readState(page)
  const origin = await page.evaluate(() => {
    const r = document.querySelector('.overflow-auto').getBoundingClientRect()
    return { left: r.left, top: r.top }
  })
  const cx = origin.left + 700
  const cy = origin.top + 500
  await page.mouse.move(cx, cy)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -300)
  await page.keyboard.up('Control')
  await page.waitForTimeout(1500)
  const after = await readState(page)

  const ratio = after.width / before.width
  check('ctrl+wheel zooms the document', ratio > 1.1, `${ratio.toFixed(3)}x`)
  // Sideways the page is still narrower than the window, so it stays centred
  // and there is nothing to scroll — only the vertical axis can hold the point.
  check(
    'the point under the cursor stays under the cursor',
    Math.abs(after.top - anchoredTo(before.top, cy, ratio)) < 3,
    `page top at ${after.top.toFixed(1)}, want ${anchoredTo(before.top, cy, ratio).toFixed(1)}`
  )
  const offCentre = await page.evaluate(() => {
    const scroller = document.querySelector('.overflow-auto')
    scroller.scrollLeft = 0
    const s = scroller.getBoundingClientRect()
    const p = document.querySelector('[data-page-index="0"]').getBoundingClientRect()
    return Math.abs(p.left - s.left - (s.right - p.right))
  })
  check('a page narrower than the window is still centred', offCentre < 2, `margins differ by ${offCentre.toFixed(1)}px`)
  await context.close()
}

for (const scroll of ['vertical', 'horizontal']) {
console.log(`\nreleasing a trackpad pinch — the frame nobody could see (${scroll})`)
{
  // ⚠️ THIS ONE CANNOT BE CHECKED BY POLLING. The bug was a single frame, and
  // reading state from Playwright every 25–40 ms steps straight over it and
  // reports a clean pass. The sampler has to run in the page, on rAF.
  //
  // What went wrong: a page's box size is set from `doc.getPage()`'s promise,
  // which resolves at an arbitrary point in a frame — routinely after that
  // frame's ResizeObserver delivery step. The browser painted the grown layout
  // still wearing the gesture's transform, and the observer said so a frame
  // late. Captured at 1.716x too big for one frame, which is the gesture's own
  // scale sitting on a layout that had already grown to match it.
  const { context, page } = await openViewer({ viewport: { width: 1200, height: 900 } }, scroll)

  await page.evaluate(() => {
    window.__frames = []
    const tick = () => {
      const p = document.querySelector('[data-page-index="0"]')
      // getBoundingClientRect INCLUDES the transform — this is what the eye sees.
      // Its left edge too, and whether the gesture's transform is still on.
      const r = p?.getBoundingClientRect()
      const held = document.querySelector('.overflow-auto').firstElementChild.style.transform !== ''
      if (p) window.__frames.push([Math.round(r.height), r.left, held])
      window.__raf = requestAnimationFrame(tick)
    }
    window.__raf = requestAnimationFrame(tick)
  })

  // A trackpad pinch arrives as a burst of ctrl+wheel ticks, not one notch.
  const cdp = await context.newCDPSession(page)
  // In the row, left of page 1's middle — page 1 opens centred and can never
  // sit right of that, so a zoom about this point is one the commit cannot
  // simply follow (James's Windows recording, 2026-10-19).
  const at = await page.evaluate((row) => {
    const r = document.querySelector('.overflow-auto').getBoundingClientRect()
    const p = document.querySelector('[data-page-index="0"]').getBoundingClientRect()
    return { x: row ? p.left + p.width / 4 : r.left + 600, y: r.top + 400 }
  }, scroll === 'horizontal')
  for (let i = 0; i < 18; i++) {
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: at.x, y: at.y, deltaX: 0, deltaY: -30, modifiers: 2
    })
    await page.waitForTimeout(16)
  }
  await page.waitForTimeout(1400)

  const samples = await page.evaluate(() => {
    cancelAnimationFrame(window.__raf)
    return window.__frames
  })
  const frames = samples.map(([height]) => height)
  const settled = frames[frames.length - 1]
  const peak = Math.max(...frames)
  // The release must never paint the page BIGGER than where it settles. The
  // gesture itself only ever grows towards that size, so a peak above it can
  // only be the transform and the new layout stacking.
  check(
    'no frame is painted larger than the zoom it settles at',
    peak <= settled + 2,
    `peak ${peak}px vs settled ${settled}px (${(peak / settled).toFixed(3)}x over ${frames.length} frames)`
  )
  // …and it must not snap SMALL either, which is how the first attempt at this
  // failed: dropping the transform on the first size report, while the layout
  // was still mid-flight at 1159px of an eventual 1435px.
  const afterGesture = frames.slice(Math.floor(frames.length * 0.6))
  const trough = Math.min(...afterGesture)
  check(
    'and none is painted smaller, which is how the first fix failed',
    trough >= settled - 2,
    `trough ${trough}px vs settled ${settled}px`
  )
  // …nor sideways. The last frame the gesture painted is where the page must
  // stay: the trackpad's draw() once held the page wherever the cursor asked,
  // and the commit then put page 1 back in the middle — a jump on release.
  const lastHeld = samples.filter(([, , held]) => held).pop()
  const settledLeft = samples[samples.length - 1][1]
  check(
    'and the page lands where the gesture left it, not beside it',
    lastHeld && Math.abs(lastHeld[1] - settledLeft) < 2,
    lastHeld ? `left ${lastHeld[1].toFixed(1)} while held, ${settledLeft.toFixed(1)} once landed` : 'no held frame'
  )
  await context.close()
}
}

await browser.close()
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall checks passed')
process.exit(failures.length ? 1 : 0)
