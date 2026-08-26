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

async function openViewer(options) {
  const context = await browser.newContext(options)
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

await browser.close()
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall checks passed')
process.exit(failures.length ? 1 : 0)
