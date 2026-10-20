// Pages in a row on a phone: an up-and-down swipe walks the row, as two
// fingers on a trackpad do on a computer (James, 2026-10-20). Swipe up for the
// next page, down for the one before; let go mid-swipe and the row coasts on.
// Sideways swipes, the column layout and the drawing tools are left alone.
//
//   npm run dev                    # Universal PDF is :5174
//   node e2e/row-swipe.e2e.mjs     # in another terminal
//
// Env: BASE (default http://localhost:5174/)
//
// Negative control (2026-10-20, run): with PdfViewer.tsx's touch handler
// taken out, the three row checks go red (up, coast, after scrolling to
// the bottom); "walks it back" stays green only because nothing moved.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PLAYWRIGHT_CANDIDATES = [
  '../../Universal_Beam/node_modules/playwright/index.js',
  '../../Universal_Exports/node_modules/playwright/index.js',
  '../../Universal_Video/node_modules/playwright/index.js',
  '../../../UNI_SIM_Assess/Ergo_Assess/frontend/node_modules/playwright/index.js',
  '../node_modules/playwright/index.js',
]
let pw = null
for (const rel of PLAYWRIGHT_CANDIDATES) {
  try {
    const mod = (await import(pathToFileURL(join(HERE, rel)).href)).default
    const probe = await mod.chromium.launch()
    await probe.close()
    pw = mod
    break
  } catch { /* try the next one */ }
}
if (!pw) {
  console.error('No Playwright found. Install it in a sibling Universal app.')
  process.exit(2)
}
const BASE = process.env.BASE ?? process.env.E2E_BASE_URL ?? 'http://localhost:5174/'

const fails = []
const check = (ok, label, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) fails.push(label)
}

const FIX = join(HERE, 'fixtures')
mkdirSync(FIX, { recursive: true })
const PDF = join(FIX, 'page-scroll-5.pdf')
{
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  for (let i = 0; i < 5; i++) doc.addPage([595, 842]).drawText(`Page ${i + 1}`, { x: 60, y: 760, size: 40 })
  writeFileSync(PDF, Buffer.from(await doc.save()))
}

const browser = await pw.chromium.launch()

async function open(layout) {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  })
  await context.addInitScript((v) => {
    try { localStorage.setItem('unisim:default-view:pdf:page-scroll', v) } catch { /* no storage */ }
  }, layout)
  const page = await context.newPage()
  page.on('pageerror', (e) => fails.push('page error: ' + e.message))
  try {
    await page.goto(BASE, { waitUntil: 'load' })
  } catch {
    console.error(`Could not reach ${BASE} — start the dev server first (npm run dev).`)
    await browser.close()
    process.exit(2)
  }
  await page.locator('input[type=file]').first().setInputFiles(PDF)
  await page.locator('[data-page-index="4"]').waitFor({ state: 'attached', timeout: 20000 })
  await page.waitForTimeout(1500)
  const cdp = await context.newCDPSession(page)
  // A swipe from one point to another in `steps` moves, `ms` apart.
  async function swipe(x1, y1, x2, y2, { steps = 12, ms = 16, hold = 0 } = {}) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1, id: 1 }] })
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x1 + ((x2 - x1) * i) / steps, y: y1 + ((y2 - y1) * i) / steps, id: 1 }],
      })
      await page.waitForTimeout(ms)
    }
    if (hold) await page.waitForTimeout(hold)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  const scroll = () => page.evaluate(() => {
    const sc = document.querySelector('[data-page-index]')?.closest('.overflow-auto')
    return { left: sc.scrollLeft, top: sc.scrollTop, sh: sc.scrollHeight, ch: sc.clientHeight }
  })
  // The middle of page 1's box, where a thumb lands.
  const middle = () => page.evaluate(() => {
    const r = document.querySelector('[data-page-index]').getBoundingClientRect()
    return { x: Math.round((r.left + r.right) / 2), y: Math.round((r.top + r.bottom) / 2) }
  })
  return { context, page, cdp, swipe, scroll, middle }
}

console.log('\nUniversal PDF — swiping up and down a row of pages')

{
  const { context, page, cdp, swipe, scroll, middle } = await open('horizontal')
  const m = await middle()
  let s0 = await scroll()
  check(s0.sh <= s0.ch + 1, 'the row fits the height, nothing to scroll up and down', JSON.stringify(s0))

  // Swipe up, held still before lifting so it doesn't coast.
  await swipe(m.x, m.y + 150, m.x, m.y - 150, { hold: 200 })
  await page.waitForTimeout(300)
  let s1 = await scroll()
  check(s1.left > s0.left + 250 && s1.top === 0, 'a swipe up walks the row to the right',
    `scrollLeft ${s0.left} → ${s1.left}, scrollTop ${s1.top}`)

  await swipe(m.x, m.y - 150, m.x, m.y + 150, { hold: 200 })
  await page.waitForTimeout(300)
  let s2 = await scroll()
  check(Math.abs(s2.left - s0.left) < 20, '…and a swipe down walks it back', `scrollLeft ${s1.left} → ${s2.left}`)

  // A quick flick keeps going once the finger is off.
  await swipe(m.x, m.y + 100, m.x, m.y - 100, { steps: 6, ms: 8 })
  const atLift = (await scroll()).left
  await page.waitForTimeout(600)
  const coasted = (await scroll()).left
  check(coasted > atLift + 40, 'a flick coasts on after the finger lifts', `scrollLeft ${atLift} at lift → ${coasted}`)

  // A sideways swipe is still the browser's own scroll.
  await page.evaluate(() => { document.querySelector('[data-page-index]').closest('.overflow-auto').scrollLeft = 0 })
  await page.waitForTimeout(200)
  s0 = await scroll()
  await swipe(m.x + 120, m.y, m.x - 120, m.y, { hold: 200 })
  await page.waitForTimeout(400)
  s1 = await scroll()
  check(s1.left > s0.left + 100, 'a sideways swipe still scrolls the row', `scrollLeft ${s0.left} → ${s1.left}`)

  // A drawing tool keeps the swipe for itself.
  await page.evaluate(async () => (await import('/src/stores/annotationStore.ts')).useAnnotationStore.getState().setTool('draw'))
  await page.waitForTimeout(300)
  s0 = await scroll()
  await swipe(m.x, m.y + 150, m.x, m.y - 150, { hold: 200 })
  await page.waitForTimeout(300)
  s1 = await scroll()
  check(Math.abs(s1.left - s0.left) < 2, 'with Draw on, a swipe up draws rather than walking the row',
    `scrollLeft ${s0.left} → ${s1.left}`)
  await page.evaluate(async () => (await import('/src/stores/annotationStore.ts')).useAnnotationStore.getState().setTool('select'))

  // Zoomed in so the page is taller than the screen: the swipe scrolls down
  // the page first, and only once at the bottom does the next one walk on.
  await page.evaluate(() => { document.querySelector('[data-page-index]').closest('.overflow-auto').scrollLeft = 0 })
  // Pinched open to well over twice the size.
  {
    const c = await middle()
    const pts = (d) => [{ x: c.x - d, y: c.y, id: 1 }, { x: c.x + d, y: c.y, id: 2 }]
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(30) })
    for (let d = 40; d <= 150; d += 10) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d) })
      await page.waitForTimeout(16)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  await page.waitForTimeout(1500)
  s0 = await scroll()
  if (s0.sh > s0.ch + 200) {
    const mm = { x: 195, y: 500 }
    await swipe(mm.x, mm.y + 100, mm.x, mm.y - 100, { hold: 200 })
    await page.waitForTimeout(400)
    s1 = await scroll()
    check(s1.top > s0.top + 50 && Math.abs(s1.left - s0.left) < 10, 'zoomed in: a swipe up scrolls down the page first',
      `top ${s0.top} → ${s1.top}, left ${s0.left} → ${s1.left}`)
    await page.evaluate(() => {
      const sc = document.querySelector('[data-page-index]').closest('.overflow-auto')
      sc.scrollTop = sc.scrollHeight
    })
    await page.waitForTimeout(200)
    s1 = await scroll()
    await swipe(mm.x, mm.y + 100, mm.x, mm.y - 100, { hold: 200 })
    await page.waitForTimeout(400)
    s2 = await scroll()
    check(s2.left > s1.left + 150, '…and at the bottom, the next swipe up walks the row',
      `left ${s1.left} → ${s2.left}`)
  } else {
    check(false, 'zoom in made the page taller than the screen', JSON.stringify(s0))
  }
  await context.close()
}

{
  // Pages one under another: up and down is the page's own scroll.
  const { context, page, swipe, scroll, middle } = await open('vertical')
  const m = await middle()
  const s0 = await scroll()
  await swipe(m.x, m.y + 150, m.x, m.y - 150, { hold: 200 })
  await page.waitForTimeout(400)
  const s1 = await scroll()
  check(s1.top > s0.top + 100 && s1.left === s0.left, 'pages in a column: a swipe up scrolls down as before',
    `top ${s0.top} → ${s1.top}, left ${s0.left} → ${s1.left}`)
  await context.close()
}

await browser.close()
if (fails.length) {
  console.log(`  ${fails.length} FAILED`)
  process.exit(1)
}
console.log('  all passed')
