// Tune this app ▸ Page scrolling — vertical (the default) or horizontal pages
// (2026-10-07). Drives the real setting through the SDK's dialog and measures
// the layout, the wheel, a page jump, persistence and Reset to defaults.
//
//   ./scripts/preview.ps1          # Universal PDF is :5174
//   npm run test:page-scroll       # in another terminal
//
// Env: BASE (default http://localhost:5174/), SHOT (save a picture of the row)
//
// Negative control (2026-10-07, run): with PdfViewer.tsx reverted to main
// (setting row present, viewer ignoring it), five checks go red — side by
// side, sideways scroll, the wheel, the page jump, and survives a reload.
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
const SHOT = process.env.SHOT

const fails = []
const check = (ok, label, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) fails.push(label)
}

// Five A4 pages, so the row is wider than any window.
const FIX = join(HERE, 'fixtures')
mkdirSync(FIX, { recursive: true })
const PDF = join(FIX, 'page-scroll-5.pdf')
{
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  for (let i = 0; i < 5; i++) doc.addPage([595, 842]).drawText(`Page ${i + 1}`, { x: 60, y: 760, size: 40 })
  writeFileSync(PDF, Buffer.from(await doc.save()))
}

const b = await pw.chromium.launch()
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
p.on('pageerror', (e) => errors.push(e.message))

async function openPdf() {
  await p.locator('input[type=file]').first().setInputFiles(PDF)
  await p.locator('[data-page-index="4"]').waitFor({ state: 'attached', timeout: 20000 })
  await p.waitForTimeout(1500)
}

// Page boxes and the scroll box, in viewport coordinates.
const layout = () => p.evaluate(() => {
  const pages = [...document.querySelectorAll('[data-page-index]')].map((el) => {
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
  })
  const sc = document.querySelector('[data-page-index]')?.closest('.overflow-auto')
  const box = sc?.getBoundingClientRect()
  return {
    pages,
    scroll: sc && { left: sc.scrollLeft, top: sc.scrollTop, sw: sc.scrollWidth, cw: sc.clientWidth, sh: sc.scrollHeight, ch: sc.clientHeight, boxLeft: box.left, boxTop: box.top },
  }
})

async function openTune() {
  const pill = p.locator('button:has-text("Actions")').first()
  await pill.waitFor({ state: 'visible', timeout: 15000 })
  await pill.hover()
  await p.waitForTimeout(600)
  const tune = p.locator('[role=menuitem]', { hasText: /Tune this app/ }).first()
  if (!(await tune.isVisible())) { await pill.click(); await p.waitForTimeout(600) }
  await tune.click()
  await p.waitForTimeout(500)
}

async function setScroll(value) {
  await openTune()
  const select = p.locator('select[aria-label="Page scrolling"]').first()
  check(await select.isVisible(), `Tune this app has the Page scrolling row (→ ${value})`)
  if (SHOT && value === 'horizontal') await select.locator('xpath=../..').screenshot({ path: SHOT })
  await select.selectOption(value)
  await p.keyboard.press('Escape')
  await p.waitForTimeout(800)
}

await p.goto(BASE, { waitUntil: 'domcontentloaded' })
await p.evaluate(() => localStorage.clear())
await p.reload({ waitUntil: 'domcontentloaded' })
await p.waitForTimeout(1500)
await openPdf()

console.log('\nUniversal PDF — Page scrolling')

let l = await layout()
check(l.pages[1].top > l.pages[0].bottom - 1 && Math.abs(l.pages[1].left - l.pages[0].left) < 2,
  'default: the pages run one under another', JSON.stringify(l.pages.slice(0, 2)))

await setScroll('horizontal')
l = await layout()
check(l.pages[1].left > l.pages[0].right - 1 && Math.abs(l.pages[1].top - l.pages[0].top) < 2,
  'horizontal: the pages sit side by side', JSON.stringify(l.pages.slice(0, 2)))
check(l.scroll.sw > l.scroll.cw, 'the row scrolls sideways', JSON.stringify(l.scroll))
const mid = (r) => (r.left + r.right) / 2
const boxMid = () => l.scroll.boxLeft + l.scroll.cw / 2
check(Math.abs(mid(l.pages[0]) - boxMid()) < 20, 'page 1 opens in the middle of the screen',
  `page 1 centre ${mid(l.pages[0])}, screen centre ${boxMid()}`)

// A plain mouse wheel walks the row — after first using up any room to
// scroll down the page (a portrait page at the 75% fit floor is a little
// taller than a 900px window).
const before = l.scroll.left
await p.mouse.move(720, 450)
for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, 300); await p.waitForTimeout(150) }
await p.waitForTimeout(400)
l = await layout()
check(l.scroll.left > before + 100, 'a plain wheel walks the row', `scrollLeft ${before} → ${l.scroll.left}`)

// A page jump (the navigator's and an internal link's — one helper) lands
// the page in the middle of the screen — even the last one.
await p.evaluate(() => {
  const sc = document.querySelector('[data-page-index]')?.closest('.overflow-auto')
  sc.scrollLeft = 0
})
await p.evaluate(async () => (await import('/src/lib/links.ts')).scrollToPage(4))
await p.waitForTimeout(1200)
l = await layout()
check(Math.abs(mid(l.pages[4]) - boxMid()) < 20, 'jumping to the last page centres it',
  `page 5 centre ${mid(l.pages[4])}, screen centre ${boxMid()}`)
await p.evaluate(async () => (await import('/src/lib/links.ts')).scrollToPage(2))
await p.waitForTimeout(1200)
l = await layout()
check(Math.abs(mid(l.pages[2]) - boxMid()) < 20, 'jumping to page 3 centres it',
  `page 3 centre ${mid(l.pages[2])}, screen centre ${boxMid()}`)

// Switching back keeps the reader on that page.
await setScroll('vertical')
l = await layout()
check(l.pages[1].top > l.pages[0].bottom - 1, 'vertical again: one under another')
check(Math.abs(l.pages[2].top - l.scroll.boxTop) < 60, 'switching keeps the reader on page 3',
  `page 3 top ${l.pages[2].top}, box ${l.scroll.boxTop}`)

// It sticks across a reload, and Reset to defaults puts it back.
await setScroll('horizontal')
await p.reload({ waitUntil: 'domcontentloaded' })
await p.waitForTimeout(1500)
await openPdf()
l = await layout()
check(l.pages[1].left > l.pages[0].right - 1, 'the choice survives a reload')

await openTune()
await p.locator('[data-testid="unisim-prefs-reset"] button').first().click()
await p.waitForTimeout(300)
await p.locator('[data-testid="unisim-prefs-reset"] button').first().click()
await p.waitForTimeout(500)
check((await p.locator('select[aria-label="Page scrolling"]').first().inputValue()) === 'vertical',
  'Reset to defaults puts the row back to Vertical')
await p.keyboard.press('Escape')
await p.waitForTimeout(800)
l = await layout()
check(l.pages[1].top > l.pages[0].bottom - 1, '…and the pages back one under another')

check(errors.length === 0, 'no page errors', errors.join(' | ').slice(0, 200))
await b.close()

if (fails.length) {
  console.log(`  ${fails.length} FAILED`)
  process.exit(1)
}
console.log('  all passed')
